'use client';

import { useState, useEffect } from 'react';
import { UserCard } from '@/lib/userApi';
import MobileDestroyCardsModal from './MobileDestroyCardsModal';
import toast from 'react-hot-toast';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock';

interface DestroyCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: UserCard[];
  onConfirm: (cardsToDestroy: { card_id: string; quantity: number; subcollection_name?: string; card_reference?: string }[]) => void;
}

export default function DestroyCardsModal({ isOpen, onClose, cards, onConfirm }: DestroyCardsModalProps) {
  const [quantities, setQuantities] = useState<{ [cardId: string]: number }>({});
  const [totalPoints, setTotalPoints] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isConfirmationPending, setIsConfirmationPending] = useState(false);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Initialize quantities to 1 for each card
      const initialQuantities: { [cardId: string]: number } = {};
      cards.forEach(card => {
        initialQuantities[card.id] = 1;
      });
      setQuantities(initialQuantities);
      // Reset confirmation pending state when modal opens
      setIsConfirmationPending(false);
      // Match withdraw modal behavior: lock body scroll while open
      lockBodyScroll();
    } else {
      // Reset confirmation pending state when modal closes
      setIsConfirmationPending(false);
    }

    // Always unlock when closing or unmounting
    return () => {
      if (isOpen) unlockBodyScroll();
    };
  }, [isOpen, cards]);

  useEffect(() => {
    // Calculate total points
    let total = 0;
    cards.forEach(card => {
      const quantity = quantities[card.id] || 0;
      total += (card.point_worth || 0) * quantity;
    });
    setTotalPoints(total);
  }, [quantities, cards]);

  const handleQuantityChange = (cardId: string, value: string) => {
    const num = parseInt(value) || 0;
    const card = cards.find(c => c.id === cardId);
    if (card && num >= 0 && num <= card.quantity) {
      setQuantities(prev => ({ ...prev, [cardId]: num }));
    }
  };

  // Compute payload for current selections
  const buildCardsToDestroy = () => {
    return Object.entries(quantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([cardId, quantity]) => {
        const card = cards.find(c => c.id === cardId);
        // Try to determine subcollection/collection for backend
        let subcollection_name: string | undefined = (card as any)?.subcollection_name as any;
        if (!subcollection_name && card?.card_reference && card.card_reference.includes('/')) {
          subcollection_name = card.card_reference.split('/')[0];
        }
        return {
          card_id: cardId,
          quantity,
          subcollection_name,
          card_reference: card?.card_reference || ''
        };
      });
  };

  // Actually perform the redeem action
  const performConfirm = () => {
    const cardsToDestroy = buildCardsToDestroy();

    if (cardsToDestroy.length === 0) {
      toast.error('Please select at least one card to destroy');
      return;
    }

    onConfirm(cardsToDestroy);
    onClose();
  };

  // Desktop-only: show a confirmation toast before proceeding
  const handleConfirmClick = () => {
    if (isMobile) {
      // Mobile path uses MobileDestroyCardsModal which has its own confirm step
      performConfirm();
      return;
    }

    // Prevent multiple confirmations at once
    if (isConfirmationPending) {
      return;
    }

    const cardsToDestroy = buildCardsToDestroy();
    if (cardsToDestroy.length === 0) {
      toast.error('Please select at least one card to destroy');
      return;
    }

    setIsConfirmationPending(true);

    const tId = toast.custom((t) => (
      <div className="max-w-md w-full bg-[#1A1B2E] text-white rounded-lg shadow-lg border border-red-500/30 p-4">
        <div className="flex items-start gap-3">
          <div className="text-red-400">⚠️</div>
          <div className="flex-1">
            <p className="text-sm leading-5">
              Warning: This action cannot be undone. Cards will be permanently redeemed for points.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {cardsToDestroy.length} card{cardsToDestroy.length > 1 ? 's' : ''} selected.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded bg-gray-600 hover:bg-gray-700 text-sm"
                onClick={() => {
                  toast.dismiss(t.id);
                  setIsConfirmationPending(false);
                }}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded bg-[#8868FF] hover:bg-[#7759EE] text-sm"
                onClick={() => {
                  toast.dismiss(t.id);
                  setIsConfirmationPending(false);
                  performConfirm();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    ), { 
      duration: 8000,
      id: 'redeem-confirmation' // Use a fixed ID to prevent duplicates
    });

    return tId;
  };

  if (!isOpen) return null;

  // Use mobile version on mobile devices
  if (isMobile) {
    return (
      <MobileDestroyCardsModal
        isOpen={isOpen}
        onClose={onClose}
        cards={cards}
        onConfirm={onConfirm}
      />
    );
  }

  // Desktop: replicate WithdrawCardsModal layout exactly (structure and classes)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <h2 className="text-2xl font-bold text-white mb-4">Redeem Cards for Points</h2>

        <div className="overflow-y-auto flex-1 mb-4">
          <div className="space-y-3">
            {cards.map(card => {
              const isExpired = new Date(card.buybackexpiresAt).getTime() <= new Date().getTime();
              return (
                <div key={card.id} className={`bg-[#2A2B3D] rounded-lg p-4 ${isExpired ? 'opacity-50' : ''}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start space-x-3 sm:space-x-4 min-w-0">
                      <img
                        src={card.image_url || '/cards/common1.jpg.svg'}
                        alt={card.card_name}
                        className="w-16 h-20 object-cover rounded flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className="text-white font-medium truncate" title={card.card_name}>{card.card_name}</h3>
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
                            disabled={isExpired}
                            className="w-16 sm:w-20 px-2 py-1 bg-[#1A1B2E] border border-gray-600 rounded text-white text-base sm:text-sm disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-600 pt-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white text-lg">Total Points to Receive:</span>
            <div className="flex items-center gap-2">
              <img src="/users/coin.png" alt="Coin" className="w-6 h-6" />
              <span className="text-yellow-400 text-2xl font-bold">{totalPoints.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClick}
              className="px-6 py-2 bg-[#8868FF] text-white rounded-lg hover:bg-[#7759EE] transition-colors"
            >
              Redeem Cards
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
