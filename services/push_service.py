import os
import json
import time
import base64
import secrets
import sqlite3
import logging
from typing import Optional, Dict, Any, List

from py_vapid import Vapid01
from pywebpush import webpush, WebPushException

logger = logging.getLogger(__name__)

_INSTANCE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance')
_DB_PATH = os.environ.get('PUSH_DB_PATH', os.path.join(_INSTANCE_DIR, 'push.sqlite3'))
_VAPID_KEY_PATH = os.environ.get('VAPID_KEY_PATH', os.path.join(_INSTANCE_DIR, 'vapid_keys.json'))
_CHECK_TOKEN_PATH = os.path.join(_INSTANCE_DIR, 'push_check_token.txt')

VAPID_CONTACT = os.environ.get('VAPID_CONTACT_EMAIL', 'mailto:weatherview-admin@example.com')

# Real weather changes worth waking someone's phone up for - not every
# forecast update, which would make the feature feel like spam within a day.
RAIN_ICON_PREFIXES = ('09', '10', '11')
THUNDERSTORM_PREFIX = '11'


def _init_db() -> None:
    os.makedirs(_INSTANCE_DIR, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, timeout=5)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint TEXT PRIMARY KEY,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                city TEXT,
                lat REAL,
                lon REAL,
                units TEXT DEFAULT 'metric',
                last_icon TEXT,
                last_temp REAL,
                last_aqi INTEGER,
                created_at REAL,
                updated_at REAL
            )
        """)
        conn.commit()
    finally:
        conn.close()


def _encode_public_key(vapid: Vapid01) -> str:
    """Browsers' pushManager.subscribe() wants applicationServerKey as an
    uncompressed EC point (0x04 || X || Y), base64url with no padding - not
    the PEM/DER format py_vapid's own key objects use internally."""
    nums = vapid.public_key.public_numbers()
    x = nums.x.to_bytes(32, 'big')
    y = nums.y.to_bytes(32, 'big')
    uncompressed = b'\x04' + x + y
    return base64.urlsafe_b64encode(uncompressed).rstrip(b'=').decode()


def _get_vapid_keys() -> tuple:
    """VAPID keys identify this server to push services and must stay
    stable - a key change silently invalidates every existing subscription.
    Env vars are checked first so a real deployment (Render, etc.) survives
    redeploys on an ephemeral filesystem; the auto-generated + file-persisted
    fallback is for local dev convenience only, and says so loudly."""
    env_public = os.environ.get('VAPID_PUBLIC_KEY')
    env_private = os.environ.get('VAPID_PRIVATE_KEY')
    if env_public and env_private:
        return env_public, env_private

    if os.path.exists(_VAPID_KEY_PATH):
        with open(_VAPID_KEY_PATH) as f:
            data = json.load(f)
        return data['public_key'], data['private_key']

    logger.warning(
        "No VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY set - auto-generating keys "
        f"and persisting them to {_VAPID_KEY_PATH}. On a host with an "
        "ephemeral filesystem (e.g. Render's free tier), these are lost on "
        "every redeploy, silently invalidating every existing push "
        "subscription. Set both env vars for any real deployment - see "
        "README.md for how to generate them once and keep them stable."
    )
    vapid = Vapid01()
    vapid.generate_keys()
    public_b64 = _encode_public_key(vapid)
    private_pem = vapid.private_pem().decode()
    os.makedirs(_INSTANCE_DIR, exist_ok=True)
    with open(_VAPID_KEY_PATH, 'w') as f:
        json.dump({'public_key': public_b64, 'private_key': private_pem}, f)
    return public_b64, private_pem


def _get_check_token() -> str:
    """Shared secret for /api/push/check - without one, anyone who finds the
    URL could trigger it repeatedly (burning OpenWeatherMap quota and
    spamming subscribed users with checks, though never with false alerts).
    Same env-var-first, persisted-file-fallback pattern as the VAPID keys."""
    env_token = os.environ.get('PUSH_CHECK_TOKEN')
    if env_token:
        return env_token
    if os.path.exists(_CHECK_TOKEN_PATH):
        with open(_CHECK_TOKEN_PATH) as f:
            return f.read().strip()
    token = secrets.token_urlsafe(24)
    os.makedirs(_INSTANCE_DIR, exist_ok=True)
    with open(_CHECK_TOKEN_PATH, 'w') as f:
        f.write(token)
    logger.warning(
        "No PUSH_CHECK_TOKEN set - auto-generated one and persisted to "
        f"{_CHECK_TOKEN_PATH}. Set PUSH_CHECK_TOKEN as an env var for "
        "production, and use the same value as the ?token= query param on "
        "the external scheduler hitting /api/push/check."
    )
    return token


_init_db()
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY = _get_vapid_keys()
CHECK_TOKEN = _get_check_token()


def save_subscription(subscription: Dict[str, Any], city: Optional[str], lat: float, lon: float, units: str) -> None:
    endpoint = subscription['endpoint']
    keys = subscription.get('keys', {})
    conn = sqlite3.connect(_DB_PATH, timeout=5)
    try:
        conn.execute(
            """
            INSERT INTO push_subscriptions (endpoint, p256dh, auth, city, lat, lon, units, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
                p256dh = excluded.p256dh, auth = excluded.auth, city = excluded.city,
                lat = excluded.lat, lon = excluded.lon, units = excluded.units,
                updated_at = excluded.updated_at
            """,
            (endpoint, keys.get('p256dh'), keys.get('auth'), city, lat, lon, units, time.time(), time.time())
        )
        conn.commit()
    finally:
        conn.close()


def remove_subscription(endpoint: str) -> None:
    conn = sqlite3.connect(_DB_PATH, timeout=5)
    try:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        conn.commit()
    finally:
        conn.close()


def get_all_subscriptions() -> List[Dict[str, Any]]:
    conn = sqlite3.connect(_DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM push_subscriptions").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def update_snapshot(endpoint: str, icon: str, temp: float, aqi: Optional[int]) -> None:
    conn = sqlite3.connect(_DB_PATH, timeout=5)
    try:
        conn.execute(
            "UPDATE push_subscriptions SET last_icon = ?, last_temp = ?, last_aqi = ?, updated_at = ? WHERE endpoint = ?",
            (icon, temp, aqi, time.time(), endpoint)
        )
        conn.commit()
    finally:
        conn.close()


def send_push(subscription_row: Dict[str, Any], title: str, body: str, tag: str = 'weather-alert') -> bool:
    subscription_info = {
        'endpoint': subscription_row['endpoint'],
        'keys': {'p256dh': subscription_row['p256dh'], 'auth': subscription_row['auth']}
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({'title': title, 'body': body, 'tag': tag}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={'sub': VAPID_CONTACT}
        )
        return True
    except WebPushException as e:
        # 404/410 means the browser dropped the subscription (uninstalled,
        # cleared data, etc.) - clean it up so future checks stop wasting a
        # request on a dead endpoint instead of erroring every time.
        status = e.response.status_code if e.response is not None else None
        if status in (404, 410):
            remove_subscription(subscription_row['endpoint'])
        else:
            logger.warning(f"Push send failed for {subscription_row.get('city')}: {str(e)}")
        return False


def _detect_abrupt_change(sub: Dict[str, Any], data: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Compares the freshly-fetched current weather against the subscription's
    last-seen snapshot and decides whether it's worth waking someone's phone
    up for. Returns None for "nothing notable changed" - most checks should
    return None, since a notification for every 10-minute fluctuation would
    make the feature worthless within a day."""
    temp_unit = '°F' if sub.get('units') == 'imperial' else '°C'
    last_icon = sub.get('last_icon') or ''
    last_temp = sub.get('last_temp')
    icon = data['icon']
    temp = data['temp']
    city = sub.get('city') or 'your location'

    was_raining = last_icon[:2] in RAIN_ICON_PREFIXES
    is_raining = icon[:2] in RAIN_ICON_PREFIXES

    # Only fire once there's a real prior snapshot to compare against - the
    # very first check after subscribing has nothing to compare to yet.
    if last_icon:
        if icon[:2] == THUNDERSTORM_PREFIX and last_icon[:2] != THUNDERSTORM_PREFIX:
            return {
                'title': f'Thunderstorm alert for {city}',
                'body': f'{data["description"]} - {round(temp)}{temp_unit} right now, take precautions.'
            }
        if not was_raining and is_raining:
            return {
                'title': f'Rain starting in {city}',
                'body': f'{data["description"]} - {round(temp)}{temp_unit} right now.'
            }
        if was_raining and not is_raining:
            return {
                'title': f'Rain has cleared in {city}',
                'body': f'Now {data["description"].lower()}, {round(temp)}{temp_unit}.'
            }

    if last_temp is not None:
        swing = abs(temp - last_temp)
        threshold = 9 if sub.get('units') == 'imperial' else 5
        if swing >= threshold:
            direction = 'risen' if temp > last_temp else 'dropped'
            return {
                'title': f'Temperature has {direction} sharply in {city}',
                'body': f'Now {round(temp)}{temp_unit}, {"up" if temp > last_temp else "down"} {round(swing)}° since the last check.'
            }

    return None


def check_all_subscriptions(weather_api) -> int:
    """Hit by an external scheduler (see /api/push/check) rather than a
    persistent background worker - Render's free tier has no long-running
    process to host one, so this piggybacks on the same keep-alive-ping
    pattern already used for /healthz. Returns how many pushes were sent."""
    notified = 0
    for sub in get_all_subscriptions():
        if sub.get('lat') is None or sub.get('lon') is None:
            continue
        try:
            data = weather_api.get_current_weather(lat=sub['lat'], lon=sub['lon'], units=sub.get('units') or 'metric')
        except Exception as e:
            logger.warning(f"Push check: weather fetch failed for {sub.get('city')}: {str(e)}")
            continue

        alert = _detect_abrupt_change(sub, data)
        if alert:
            if send_push(sub, alert['title'], alert['body']):
                notified += 1

        update_snapshot(sub['endpoint'], data['icon'], data['temp'], None)

    return notified
