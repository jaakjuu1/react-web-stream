import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    permission: 'default',
    isLoading: true,
    error: null,
  });

  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  // Check support and current status on mount
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;

      if (!isSupported) {
        setState((prev) => ({
          ...prev,
          isSupported: false,
          isLoading: false,
        }));
        return;
      }

      try {
        // Get VAPID public key from server
        const response = await fetch('/api/push/vapid-public-key');
        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            isSupported: true,
            permission: Notification.permission,
            isLoading: false,
            error: 'Push notifications not configured on server',
          }));
          return;
        }

        const { publicKey, configured } = await response.json();
        if (!configured || !publicKey) {
          setState((prev) => ({
            ...prev,
            isSupported: true,
            permission: Notification.permission,
            isLoading: false,
            error: 'Push notifications not configured',
          }));
          return;
        }

        setVapidPublicKey(publicKey);

        // Check if already subscribed
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        setState({
          isSupported: true,
          isSubscribed: !!subscription,
          permission: Notification.permission,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error('[PushNotifications] Init error:', err);
        setState((prev) => ({
          ...prev,
          isSupported: true,
          permission: Notification.permission,
          isLoading: false,
          error: 'Failed to initialize push notifications',
        }));
      }
    };

    checkSupport();
  }, []);

  // Register service worker
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[PushNotifications] Service worker registered');
      return registration;
    } catch (err) {
      console.error('[PushNotifications] SW registration failed:', err);
      return null;
    }
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!vapidPublicKey) {
      setState((prev) => ({ ...prev, error: 'VAPID key not available' }));
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));

      if (permission !== 'granted') {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Notification permission denied',
        }));
        return false;
      }

      // Register service worker if needed
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await registerServiceWorker();
      }

      if (!registration) {
        throw new Error('Failed to register service worker');
      }

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Send subscription to server
      const subscriptionJson = subscription.toJSON();
      await api.subscribePush({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscriptionJson.keys?.p256dh || '',
          auth: subscriptionJson.keys?.auth || '',
        },
      });

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));

      console.log('[PushNotifications] Subscribed successfully');
      return true;
    } catch (err) {
      console.error('[PushNotifications] Subscribe error:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to subscribe',
      }));
      return false;
    }
  }, [vapidPublicKey, registerServiceWorker]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Notify server
        await api.unsubscribePush(subscription.endpoint);

        // Unsubscribe locally
        await subscription.unsubscribe();
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      console.log('[PushNotifications] Unsubscribed successfully');
      return true;
    } catch (err) {
      console.error('[PushNotifications] Unsubscribe error:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to unsubscribe',
      }));
      return false;
    }
  }, []);

  // Test notification
  const testNotification = useCallback(async (): Promise<boolean> => {
    try {
      await api.testPushNotification();
      return true;
    } catch (err) {
      console.error('[PushNotifications] Test notification error:', err);
      return false;
    }
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
    testNotification,
  };
}

// Helper function to convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
