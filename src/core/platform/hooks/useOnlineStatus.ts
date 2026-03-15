/**
 * Platform Online Status Hook
 *
 * Detects online/offline state using a platform-agnostic API.
 * Web: uses window online/offline events
 * React Native (future): swap to @react-native-community/netinfo
 *
 * @see documentation/rules/mobile-portability.md — Rule 19
 */

import { useState, useEffect } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
