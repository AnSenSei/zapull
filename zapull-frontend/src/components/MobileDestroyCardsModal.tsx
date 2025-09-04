'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { UserCard } from '@/lib/userApi';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock';

interface MobileDestroyCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: UserCard[];
  onConfirm: (cardsToDestroy: { card_id: string; quantity: number; card_reference?: string }[]) => void;
}

export default function MobileDestroyCardsModal({ isOpen, onClose, cards, onConfirm }: MobileDestroyCardsModalProps) {
  const [quantities, setQuantities] = useState<{ [cardId: string]: number }>({});
  const [totalPoints, setTotalPoints] = useState(0);
  const [currentStep, setCurrentStep] = useState<'cards' | 'confirm'>('cards');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Initialize quantities to 1 for each card
      const initialQuantities: { [cardId: string]: number } = {};
      cards.forEach(card => {
        initialQuantities[card.id] = 1;
      });
      setQuantities(initialQuantities);
      setCurrentStep('cards');
      setError(null);
    }
  }, [isOpen, cards]);

  // Lock background scrolling and interactions when open
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isOpen]);

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

  const handleConfirm = () => {
    const cardsToDestroy = Object.entries(quantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([cardId, quantity]) => {
        const card = cards.find(c => c.id === cardId);
        return { 
          card_id: cardId, 
          quantity,
          card_reference: card?.card_reference || ''
        };
      });
    
    if (cardsToDestroy.length === 0) {
      setError('Please select at least one card to destroy');
      return;
    }
    
    onConfirm(cardsToDestroy);
    onClose();
  };

  // Auto-dismiss error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-[99999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <motion.div 
        className="relative w-full h-full sm:w-full sm:max-w-md sm:h-auto sm:max-h-[95vh] overflow-hidden z-[100000] flex flex-col"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '0px',
          border: '2px solid #8B5CF6'
        }}
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-purple-500/20">
          <h2 className="text-white text-lg font-bold">REDEEM CARDS FOR POINTS</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 transition-colors bg-black bg-opacity-50 rounded-full p-1"
          >
            <Image src="/icons/close.png" alt="Close" width={16} height={16} />
          </button>
        </div>
        
        {/* Content container */}
        <div className="flex-1 overflow-y-auto">
          {/* Step Navigation */}
          <div className="flex border-b border-purple-500/20">
            <button 
              className={`flex-1 py-2 px-3 text-xs font-medium transition-colors ${
                currentStep === 'cards' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'
              }`}
              onClick={() => setCurrentStep('cards')}
            >
              Select Cards
            </button>
            <button 
              className={`flex-1 py-2 px-3 text-xs font-medium transition-colors ${
                currentStep === 'confirm' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'
              }`}
              onClick={() => setCurrentStep('confirm')}
            >
              Confirm
            </button>
          </div>

          <div className="p-3">
            {/* Cards Selection Step */}
            {currentStep === 'cards' && (
              <div className="space-y-3">
                <p className="text-white text-sm font-medium mb-3">Select cards to redeem for points</p>
                
                <div className="space-y-2">
                  {cards.map(card => {
                    const isExpired = new Date(card.buybackexpiresAt).getTime() <= new Date().getTime();
                    return (
                      <div key={card.id} className={`bg-[#2A2B3D] rounded-lg p-3 ${isExpired ? 'opacity-50' : ''}`}>
                        <div className="flex items-start space-x-3">
                          <img 
                            src={card.image_url || '/cards/common1.jpg.svg'} 
                            alt={card.card_name}
                            className="w-12 h-16 object-cover rounded flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-medium text-sm truncate">{card.card_name}</h3>
                            <div className="flex items-center gap-1 mt-1">
                              <img src="/users/coin.png" alt="Coin" className="w-3 h-3" />
                              <span className="text-yellow-400 text-xs">{card.point_worth?.toFixed(2) || '0.00'} per card</span>
                            </div>
                            <p className="text-gray-400 text-xs mt-1">Available: {card.quantity}</p>
                            {isExpired && (
                              <p className="text-red-400 text-xs mt-1">Buyback expired</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center space-x-2">
                            <label className="text-white text-xs">Quantity:</label>
                            <input
                              type="number"
                              min="0"
                              max={card.quantity}
                              value={quantities[card.id] || 0}
                              onChange={(e) => handleQuantityChange(card.id, e.target.value)}
                              disabled={isExpired}
                              className="w-16 px-2 py-1 bg-[#1A1B2E] border border-gray-600 rounded text-white text-base sm:text-sm disabled:opacity-50"
                            />
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              <img src="/users/coin.png" alt="Coin" className="w-3 h-3" />
                              <span className="text-yellow-400 font-medium text-xs">
                                {((card.point_worth || 0) * (quantities[card.id] || 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Confirmation Step */}
            {currentStep === 'confirm' && (
              <div className="space-y-4">
                <p className="text-white text-sm font-medium mb-3">Confirm redemption</p>
                
                {/* Summary */}
                <div className="bg-[#2A2B3D] rounded-lg p-3">
                  <h4 className="text-white text-sm font-medium mb-2">Cards to redeem:</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {Object.entries(quantities)
                      .filter(([_, quantity]) => quantity > 0)
                      .map(([cardId, quantity]) => {
                        const card = cards.find(c => c.id === cardId);
                        if (!card) return null;
                        return (
                          <div key={cardId} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300 truncate flex-1">{card.card_name} x{quantity}</span>
                            <div className="flex items-center gap-1 ml-2">
                              <img src="/users/coin.png" alt="Coin" className="w-3 h-3" />
                              <span className="text-yellow-400">{((card.point_worth || 0) * quantity).toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
                
                {/* Warning */}
                <div className="bg-red-500/20 rounded-lg p-3 border border-red-500/30">
                    <p className="text-red-400 text-xs">
                    ⚠️ Warning: This action cannot be undone. Cards will be permanently redeemed for points.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - sticky at bottom, like withdraw */}
        <div className="border-t border-purple-500/20 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-medium">Total Points{currentStep === 'confirm' ? ' to Receive' : ''}:</span>
            <div className="flex items-center gap-2">
              <img src="/users/coin.png" alt="Coin" className="w-4 h-4" />
              <span className="text-yellow-400 text-lg font-bold">{totalPoints.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              className="flex-1 px-4 py-3 rounded-lg text-white font-medium text-sm bg-gray-600"
              onClick={onClose}
            >
              Cancel
            </button>
            {currentStep === 'cards' ? (
              <button 
                className="flex-1 px-4 py-3 rounded-lg text-white font-medium text-sm"
                style={{ background: totalPoints > 0 ? '#8868FF' : '#666' }}
                onClick={() => setCurrentStep('confirm')}
                disabled={totalPoints <= 0}
              >
                Continue to Confirm
              </button>
            ) : (
              <button 
                className="flex-1 px-4 py-3 rounded-lg text-white font-medium text-sm"
                style={{ background: '#8868FF' }}
                onClick={handleConfirm}
              >
                Redeem Cards
              </button>
            )}
          </div>
        </div>
      </motion.div>
       
      {/* Error message */}
      {error && (
        <div className="fixed top-4 left-4 right-4 bg-red-500 text-white p-3 rounded-lg z-[110] text-sm flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="ml-2 text-white hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}