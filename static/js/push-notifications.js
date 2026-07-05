/**
 * WeatherView - Push notification subscription
 *
 * Thin wrapper around the browser's Push API + the /api/push/* endpoints.
 * The actual "smart" decision of *when* to notify happens entirely
 * server-side (services/push_service.py, checked periodically by an
 * external scheduler) - this module only handles the one-time subscribe/
 * unsubscribe handshake and remembering which location was subscribed.
 */
const WVPush = {
    isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    // applicationServerKey must be a Uint8Array, not the base64url string
    // the server hands back.
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    },

    async getCurrentSubscription() {
        if (!this.isSupported()) return null;
        const registration = await navigator.serviceWorker.ready;
        return registration.pushManager.getSubscription();
    },

    async subscribe(location, units) {
        if (!this.isSupported()) throw new Error('Push notifications are not supported in this browser.');

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission was not granted.');
        }

        const keyResponse = await fetch('/api/push/vapid-public-key');
        if (!keyResponse.ok) throw new Error('Could not reach the server to set up notifications.');
        const { publicKey } = await keyResponse.json();

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this._urlBase64ToUint8Array(publicKey)
        });

        const response = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                city: location.city,
                lat: location.lat,
                lon: location.lon,
                units
            })
        });
        if (!response.ok) {
            await subscription.unsubscribe();
            throw new Error('Could not save your subscription - please try again.');
        }

        localStorage.setItem('wv_pushSubscribed', 'true');
        return subscription;
    },

    async unsubscribe() {
        const subscription = await this.getCurrentSubscription();
        if (subscription) {
            try {
                await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
            } finally {
                await subscription.unsubscribe();
            }
        }
        localStorage.removeItem('wv_pushSubscribed');
    }
};

window.WVPush = WVPush;
