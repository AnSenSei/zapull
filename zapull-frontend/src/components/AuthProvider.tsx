'use client';

import { useEffect } from 'react';
import { initAuthListener, getCurrentUserId } from '@/lib/authUtils';
import { useAuthStore } from '@/store/authStore';
import { userApi } from '@/lib/userApi';

/**
 * 认证提供者组件
 * 用于初始化认证监听器，在应用启动时自动检查用户登录状态并加载用户信息
 */
export default function AuthProvider() {
  const { userInfo, setUserInfo, uid } = useAuthStore();
  
  useEffect(() => {
    // Initialize auth listener
    const unsubscribe = initAuthListener();
    
    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Check and refresh user info when uid changes
  useEffect(() => {
    const refreshUserInfo = async () => {
      if (uid && (!userInfo || !userInfo.displayName)) {
        try {
          console.log('AuthProvider: Refreshing user info', uid);
          const updatedUserInfo = await userApi.getUserInfo();
          setUserInfo(updatedUserInfo);
        } catch (error) {
          console.error('AuthProvider: Failed to get user info:', error);
        }
      }
    };
    
    // Only refresh if we have a uid
    if (uid) {
      refreshUserInfo();
    }
  }, [uid, userInfo, setUserInfo]);

  // 这个组件不渲染任何内容，只负责初始化认证监听器
  return null;
}