import { useState, useEffect } from 'react';
import { useUIStore } from '../store/ui.store';

/**
 * Online Status Hook
 * Detects when user goes online/offline and shows notifications
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const addNotification = useUIStore((state: any) => state.addNotification);

  useEffect(() => {
    // Update state when online status changes
    const handleOnline = () => {
      setIsOnline(true);
      
      addNotification({
        type: 'success',
        title: 'Back Online',
        message: 'Your internet connection has been restored',
        duration: 3000,
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      
      addNotification({
        type: 'warning',
        title: 'No Internet Connection',
        message: 'You are currently offline. Some features may not work.',
        duration: 5000,
      });
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addNotification]);

  return isOnline;
}

