'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { checkSellDealAchievementsGlobal } from '@/lib/achievementChecker';
import { auth } from '@/lib/firebase';

/**
 * Component that periodically checks for achievements
 * Checks sell_deal_reached achievements every hour
 */
export const PeriodicAchievementChecker: React.FC = () => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  
  // Check sell achievements periodically
  const checkSellAchievements = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        console.log('Performing periodic sell achievement check...');
        await checkSellDealAchievementsGlobal();
      }
    } catch (error) {
      console.error('Error in periodic sell achievement check:', error);
    }
  };

  useEffect(() => {
    // Check immediately when component mounts (user logs in)
    checkSellAchievements();

    // Set up periodic check every hour (3600000 ms)
    intervalRef.current = setInterval(() => {
      checkSellAchievements();
    }, 3600000); // 1 hour

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // User just logged in, check achievements
        checkSellAchievements();
      }
    });

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      unsubscribe();
    };
  }, []);

  // This component doesn't render anything
  return null;
};