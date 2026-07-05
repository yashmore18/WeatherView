import pytest
from services import push_service


@pytest.fixture(autouse=True)
def clean_subscriptions():
    """Each test starts from an empty subscriptions table - conftest.py
    points PUSH_DB_PATH at a fresh temp file per test session, but tests
    within that session still share the same file."""
    for sub in push_service.get_all_subscriptions():
        push_service.remove_subscription(sub['endpoint'])
    yield
    for sub in push_service.get_all_subscriptions():
        push_service.remove_subscription(sub['endpoint'])


class TestSubscriptionStorage:
    def test_save_and_retrieve_subscription(self):
        subscription = {'endpoint': 'https://push.example/abc', 'keys': {'p256dh': 'p256dh-key', 'auth': 'auth-key'}}
        push_service.save_subscription(subscription, 'London', 51.5, -0.12, 'metric')

        subs = push_service.get_all_subscriptions()
        assert len(subs) == 1
        assert subs[0]['endpoint'] == 'https://push.example/abc'
        assert subs[0]['city'] == 'London'
        assert subs[0]['lat'] == 51.5
        assert subs[0]['units'] == 'metric'

    def test_save_subscription_upserts_on_same_endpoint(self):
        sub_a = {'endpoint': 'https://push.example/abc', 'keys': {'p256dh': 'a', 'auth': 'a'}}
        push_service.save_subscription(sub_a, 'London', 51.5, -0.12, 'metric')
        push_service.save_subscription(sub_a, 'Paris', 48.85, 2.35, 'metric')

        subs = push_service.get_all_subscriptions()
        assert len(subs) == 1
        assert subs[0]['city'] == 'Paris'

    def test_remove_subscription(self):
        subscription = {'endpoint': 'https://push.example/xyz', 'keys': {'p256dh': 'a', 'auth': 'a'}}
        push_service.save_subscription(subscription, 'Tokyo', 35.68, 139.69, 'metric')
        push_service.remove_subscription('https://push.example/xyz')
        assert push_service.get_all_subscriptions() == []

    def test_update_snapshot(self):
        subscription = {'endpoint': 'https://push.example/snap', 'keys': {'p256dh': 'a', 'auth': 'a'}}
        push_service.save_subscription(subscription, 'Mumbai', 19.07, 72.87, 'metric')
        push_service.update_snapshot('https://push.example/snap', '10d', 27.5, 3)

        subs = push_service.get_all_subscriptions()
        assert subs[0]['last_icon'] == '10d'
        assert subs[0]['last_temp'] == 27.5
        assert subs[0]['last_aqi'] == 3


class TestAbruptChangeDetection:
    """These are the rules deciding whether a check actually wakes someone's
    phone up - most checks should find nothing notable, since a push for
    every routine update would make the feature worthless within a day."""

    def test_no_prior_snapshot_never_fires(self):
        sub = {'city': 'London', 'units': 'metric', 'last_icon': None, 'last_temp': None}
        data = {'icon': '10d', 'temp': 30, 'description': 'Heavy Rain'}
        assert push_service._detect_abrupt_change(sub, data) is None

    def test_rain_starting_fires(self):
        sub = {'city': 'London', 'units': 'metric', 'last_icon': '01d', 'last_temp': 20}
        data = {'icon': '10d', 'temp': 19, 'description': 'Light Rain'}
        alert = push_service._detect_abrupt_change(sub, data)
        assert alert is not None
        assert 'Rain starting' in alert['title']

    def test_rain_clearing_fires(self):
        sub = {'city': 'London', 'units': 'metric', 'last_icon': '10d', 'last_temp': 18}
        data = {'icon': '02d', 'temp': 19, 'description': 'Few Clouds'}
        alert = push_service._detect_abrupt_change(sub, data)
        assert alert is not None
        assert 'cleared' in alert['title']

    def test_thunderstorm_starting_fires(self):
        sub = {'city': 'Miami', 'units': 'imperial', 'last_icon': '04d', 'last_temp': 80}
        data = {'icon': '11d', 'temp': 78, 'description': 'Thunderstorm'}
        alert = push_service._detect_abrupt_change(sub, data)
        assert alert is not None
        assert 'Thunderstorm' in alert['title']

    def test_sharp_temperature_rise_fires_metric(self):
        sub = {'city': 'Delhi', 'units': 'metric', 'last_icon': '01d', 'last_temp': 25}
        data = {'icon': '01d', 'temp': 31, 'description': 'Clear Sky'}
        alert = push_service._detect_abrupt_change(sub, data)
        assert alert is not None
        assert 'risen' in alert['title']

    def test_sharp_temperature_drop_fires_imperial(self):
        sub = {'city': 'Chicago', 'units': 'imperial', 'last_icon': '01d', 'last_temp': 70}
        data = {'icon': '01d', 'temp': 58, 'description': 'Clear Sky'}
        alert = push_service._detect_abrupt_change(sub, data)
        assert alert is not None
        assert 'dropped' in alert['title']

    def test_minor_temperature_change_does_not_fire(self):
        sub = {'city': 'Paris', 'units': 'metric', 'last_icon': '01d', 'last_temp': 20}
        data = {'icon': '01d', 'temp': 21.5, 'description': 'Clear Sky'}
        assert push_service._detect_abrupt_change(sub, data) is None

    def test_stable_conditions_do_not_fire(self):
        sub = {'city': 'Paris', 'units': 'metric', 'last_icon': '10d', 'last_temp': 18}
        data = {'icon': '10d', 'temp': 18.5, 'description': 'Light Rain'}
        assert push_service._detect_abrupt_change(sub, data) is None
