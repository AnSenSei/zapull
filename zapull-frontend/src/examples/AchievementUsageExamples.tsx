'use client';

import React, { useState } from 'react';
import { 
  checkDrawAchievementsGlobal,
  checkFusionAchievementsGlobal,
  checkBuyDealAchievementsGlobal,
  checkAchievementsGlobal
} from '@/lib/achievementChecker';
import { userApi } from '@/lib/userApi';
import { fusionApi } from '@/lib/fusionApi';
import marketplaceApi from '@/lib/marketplaceApi';

/**
 * Example component showing how to use the achievement system
 * with different operations
 */
export const AchievementUsageExamples: React.FC = () => {
  const [isChecking, setIsChecking] = useState(false);

  // Example 1: Drawing cards
  const handleDrawCards = async () => {
    try {
      // Draw the cards
      const result = await userApi.drawMultipleCards('pack123', 'collection123', 5);
      
      // Check achievements after successful draw
      await checkDrawAchievementsGlobal();
      
      console.log('Drew cards:', result);
    } catch (error) {
      console.error('Failed to draw cards:', error);
    }
  };

  // Example 2: Fusion/Synthesis
  const handleFusion = async () => {
    try {
      // Perform fusion
      const result = await fusionApi.performFusion({
        result_card_id: 'card123',
        collection_id: 'collection123',
        pack_id: 'pack123'
      });
      
      // Check achievements after successful fusion
      await checkFusionAchievementsGlobal();
      
      console.log('Fusion result:', result);
    } catch (error) {
      console.error('Failed to perform fusion:', error);
    }
  };

  // Example 3: Marketplace purchase with points
  const handleBuyWithPoints = async (listingId: string) => {
    try {
      // Buy the card
      const result = await marketplaceApi.payWithPoints(listingId, 1);
      
      // Check achievements after successful purchase
      await checkBuyDealAchievementsGlobal();
      
      console.log('Purchase result:', result);
    } catch (error) {
      console.error('Failed to buy card:', error);
    }
  };

  // Example 4: Marketplace purchase with cash (Stripe)
  const handleBuyWithCash = async (listingId: string) => {
    try {
      // This will redirect to Stripe checkout
      // Add source=marketplace to the success URL so we can check achievements on return
      const result = await marketplaceApi.payWithCash(listingId, 1);
      
      // Note: Achievement check will happen on the payment success page
      // using the useStripeCheckoutSuccess hook
      
      console.log('Redirecting to payment...', result);
    } catch (error) {
      console.error('Failed to initiate payment:', error);
    }
  };

  // Example 5: Custom achievement check
  const handleCustomCheck = async () => {
    try {
      // Check multiple achievement types at once
      await checkAchievementsGlobal('custom', {
        draw_by_rarity: true,
        buy_deal_reached: true,
        level_reached: true
      });
    } catch (error) {
      console.error('Failed to check custom achievements:', error);
    }
  };

  return (
    <div className="space-y-4">
      <button 
        onClick={handleDrawCards}
        disabled={isChecking}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Draw Cards (with achievement check)
      </button>

      <button 
        onClick={handleFusion}
        disabled={isChecking}
        className="px-4 py-2 bg-green-500 text-white rounded"
      >
        Perform Fusion (with achievement check)
      </button>

      <button 
        onClick={() => handleBuyWithPoints('listing123')}
        disabled={isChecking}
        className="px-4 py-2 bg-purple-500 text-white rounded"
      >
        Buy with Points (with achievement check)
      </button>

      <button 
        onClick={() => handleBuyWithCash('listing123')}
        disabled={isChecking}
        className="px-4 py-2 bg-yellow-500 text-white rounded"
      >
        Buy with Cash (achievement check on success page)
      </button>

      <button 
        onClick={handleCustomCheck}
        disabled={isChecking}
        className="px-4 py-2 bg-red-500 text-white rounded"
      >
        Custom Achievement Check
      </button>

      {isChecking && <p>Checking achievements...</p>}
    </div>
  );
};