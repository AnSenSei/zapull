'use client';

import { useState, useEffect } from 'react';
import { UserCard } from '@/lib/userApi';
import toast from 'react-hot-toast';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock';

interface WithdrawCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: UserCard[];
  onConfirm: (cardsToWithdraw: { card_id: string; card_name: string; quantity: number; subcollection_name: string }[]) => void;
}

export default function WithdrawCardsModal({ isOpen, onClose, cards, onConfirm }: WithdrawCardsModalProps) {
  const [quantities, setQuantities] = useState<{ [cardId: string]: number }>({});
  const [totalCards, setTotalCards] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Initialize quantities to 1 for each card
      const initialQuantities: { [cardId: string]: number } = {};
      cards.forEach(card => {
        initialQuantities[card.id] = 1;
      });
      setQuantities(initialQuantities);
      // Lock body scroll when modal opens
      lockBodyScroll();
    }
    
    // Cleanup function to unlock scroll when modal closes or component unmounts
    return () => {
      if (isOpen) {
        unlockBodyScroll();
      }
    };
  }, [isOpen, cards]);

  useEffect(() => {
    // Calculate total cards
    let total = 0;
    Object.values(quantities).forEach(quantity => {
      total += quantity;
    });
    setTotalCards(total);
  }, [quantities]);

  const handleQuantityChange = (cardId: string, value: string) => {
    const num = parseInt(value) || 0;
    const card = cards.find(c => c.id === cardId);
    if (card && num >= 0 && num <= card.quantity) {
      setQuantities(prev => ({ ...prev, [cardId]: num }));
    }
  };

  const handleConfirm = () => {
    const cardsToWithdraw = Object.entries(quantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([cardId, quantity]) => {
        const card = cards.find(c => c.id === cardId)!;
        return { 
          card_id: card.id,
          card_name: card.card_name,
          quantity,
          subcollection_name: card.subcollection_name
        };
      });
    
    if (cardsToWithdraw.length === 0) {
      toast.error('Please select at least one card to withdraw');
      return;
    }
    
    // Check if total quantity exceeds 12
    const totalQuantity = cardsToWithdraw.reduce((sum, card) => sum + card.quantity, 0);
    if (totalQuantity > 12) {
      toast.error('You can withdraw a maximum of 12 cards per order. Please reduce the quantity.');
      return;
    }
    
    onConfirm(cardsToWithdraw);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <h2 className="text-2xl font-bold text-white mb-4">Withdraw Physical Cards</h2>
        
        <div className="overflow-y-auto flex-1 mb-4">
          <div className="space-y-3">
            {cards.map(card => (
              <div key={card.id} className="bg-[#2A2B3D] rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start space-x-3 sm:space-x-4 min-w-0">
                    <img 
                      src={card.image_url || '/cards/common1.jpg.svg'} 
                      alt={card.card_name}
                      className="w-16 h-20 object-cover rounded flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="text-white font-medium truncate" title={card.card_name}>{card.card_name}</h3>
                      {/* Collection removed for mobile clarity */}
                    </div>
                  </div>
                  
                  <div className="flex items-center sm:items-end justify-between sm:justify-end gap-3">
                    <div className="text-left sm:text-right">
                      <p className="text-gray-400 text-xs sm:text-sm mb-1">Available: {card.quantity}</p>
                      <div className="flex items-center space-x-2">
                        <label className="text-white text-sm">Quantity:</label>
                        <input
                          type="number"
                          min="0"
                          max={card.quantity}
                          value={quantities[card.id] || 0}
                          onChange={(e) => handleQuantityChange(card.id, e.target.value)}
                          className="w-16 sm:w-20 px-2 py-1 bg-[#1A1B2E] border border-gray-600 rounded text-white text-base sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="border-t border-gray-600 pt-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white text-lg">Total Cards to Withdraw:</span>
            <span className={`text-2xl font-bold ${totalCards > 12 ? 'text-red-400' : 'text-white'}`}>
              {totalCards}
              {totalCards > 12 && <span className="text-sm ml-2">(Max: 12)</span>}
            </span>
          </div>
          
          <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-3 mb-4">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> You can modify or cancel your withdrawal request before it&apos;s processed at 4 AM EDT daily.
            </p>
          </div>
          
          <div className="flex justify-end space-x-4">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-[#8868FF] text-white rounded-lg hover:bg-[#7759EE] transition-colors"
            >
              Continue to Shipping Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}