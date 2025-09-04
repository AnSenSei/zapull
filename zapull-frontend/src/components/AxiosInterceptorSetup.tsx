'use client';

import { useEffect } from 'react';
import '@/lib/axiosConfig'; // Import to ensure interceptors are set up

export default function AxiosInterceptorSetup() {
  useEffect(() => {
    console.log('Axios interceptors initialized');
  }, []);
  
  return null;
}