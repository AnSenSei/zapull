'use client';

import { useEffect } from 'react';
import { checkBuyDealAchievementsGlobal } from '@/lib/achievementChecker';

/**
 * Hook to handle Stripe checkout success and check achievements
 * This should be used on the payment success/complete page
 */
export const useStripeCheckoutSuccess = () => {
  useEffect(() => {
    // Check if we're on a success page and came from a marketplace purchase
    const searchParams = new URLSearchParams(window.location.search);
    const sessionId = searchParams.get('session_id');
    const paymentIntent = searchParams.get('payment_intent');
    const source = searchParams.get('source');

    // Check if this is a marketplace buy deal payment
    if ((sessionId || paymentIntent) && source === 'marketplace') {
      // Check buy deal achievements after successful Stripe payment
      checkBuyDealAchievementsGlobal()
        .then(() => {
          console.log('Checked buy deal achievements after Stripe payment');
        })
        .catch((error) => {
          console.error('Failed to check achievements after Stripe payment:', error);
        });
    }
  }, []);
};