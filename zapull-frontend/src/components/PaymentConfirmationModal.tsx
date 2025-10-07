'use client';

import { useState } from 'react';

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  itemCount: number;
  onConfirm: () => Promise<void>;
}

export default function PaymentConfirmationModal({
  isOpen,
  onClose,
  subtotal,
  itemCount,
  onConfirm
}: PaymentConfirmationModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Error confirming payment:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[70] bg-black/60 transition-opacity"
        onClick={onClose}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-[#1A1B2E] rounded-lg p-6 w-full max-w-md border border-purple-500/30">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Confirm Purchase</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled={loading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Price Breakdown */}
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-center text-gray-300">
              <span>Items ({itemCount})</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            
            <div className="border-t border-gray-600 pt-4">
              <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
                <span>Tax</span>
                <span className="text-xs">Calculated at checkout</span>
              </div>
            </div>
            
            <div className="border-t border-gray-600 pt-4">
              <div className="flex justify-between items-center text-xl font-bold">
                <span className="text-white">Total</span>
                <span className="text-green-400">${subtotal.toFixed(2)}*</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">* Plus applicable taxes</p>
            </div>
          </div>
          
          {/* Info Note */}
          <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-3 mb-6">
            <p className="text-blue-400 text-sm">
              <strong>Note:</strong> You will be redirected to Stripe to complete your payment securely. 
              Tax will be calculated automatically based on your location.
            </p>
          </div>
          
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Proceed to Payment'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
