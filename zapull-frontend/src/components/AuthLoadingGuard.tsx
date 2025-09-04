'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthLoadingGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function AuthLoadingGuard({ children, requireAuth = false }: AuthLoadingGuardProps) {
  const [authChecked, setAuthChecked] = useState(false);
  const { authInitialized } = useAuthStore();
  
  useEffect(() => {
    // Wait for Firebase to restore the auth state
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Give it a tiny bit more time to ensure store is updated
      setTimeout(() => {
        setAuthChecked(true);
      }, 100);
    });
    
    // Timeout after 3 seconds to prevent infinite loading
    const timeout = setTimeout(() => {
      setAuthChecked(true);
    }, 3000);
    
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);
  
  // Show loading only if auth is required and not yet checked
  if (requireAuth && !authChecked && !authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">
          <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
          <div className="text-sm">Loading...</div>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}