'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';

export default function AuthListener() {
  const { openLoginModal } = useAuthStore();

  useEffect(() => {
    const handleAuthRequired = (event: CustomEvent) => {
      const { reason, message } = event.detail;
      
      // Show appropriate message to user
      if (reason === 'no-token') {
        toast.error(message || 'Please login to continue');
        openLoginModal();
      } else if (reason === 'token-expired') {
        // Token refresh should be handled automatically by the interceptor
        // This case shouldn't normally happen
        toast.error('Session expired, please login again');
        openLoginModal();
      }
    };

    // Add event listener
    window.addEventListener('auth-required', handleAuthRequired as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('auth-required', handleAuthRequired as EventListener);
    };
  }, [openLoginModal]);

  return null;
}