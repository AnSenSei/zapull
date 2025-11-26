'use client';

import { useState, useEffect } from 'react';
import { OfficialCard } from '@/lib/marketplaceApi';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock';
import CardDetailModal from '@/components/CardDetailModal';
import PaymentConfirmationModal from '@/components/PaymentConfirmationModal';
import SelectAddressModal from '@/components/SelectAddressModal';
import AddressModal from '@/components/AddressModal';
import { Card } from '@/lib/packsApi';
import paymentApi from '@/lib/paymentApi';
import { AddressBuilder } from '@/lib/addressBuilder';
import { getCurrentUserId } from '@/lib/authUtils';
import { userApi } from '@/lib/userApi';
import { useAuthStore } from '@/store/authStore';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: Map<string, { card: OfficialCard; quantity: number }>;
  onSuccess: () => void;
  userId?: string;
}

interface Address {
  id: string;
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default?: boolean;
}

export default function CheckoutModal({ isOpen, onClose, selectedItems, onSuccess, userId }: CheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [localItems, setLocalItems] = useState(selectedItems);
  const [editingQuantity, setEditingQuantity] = useState<{ [key: string]: string }>({});
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedListing, setSelectedListing] = useState<OfficialCard | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isAddAddressModalOpen, setIsAddAddressModalOpen] = useState(false);
  const [isEditAddressModalOpen, setIsEditAddressModalOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isPaymentConfirmModalOpen, setIsPaymentConfirmModalOpen] = useState(false);
  const { uid, openLoginModal } = useAuthStore();

  // Lock/unlock body scroll when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      // Initialize local items from selectedItems
      setLocalItems(new Map(selectedItems));
      // Fetch default address
      fetchDefaultAddress();
    }
    return () => {
      if (isOpen) {
        unlockBodyScroll();
      }
    };
  }, [isOpen, selectedItems]);

  const fetchDefaultAddress = async () => {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const { getAuthHeaders } = await import('@/lib/authUtils');
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch(`${apiBaseUrl}/accounts/addresses`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });

      if (response.ok) {
        const data = await response.json();
        const addresses = data.addresses || [];
        
        // Find default address or use first one
        const defaultAddr = addresses.find((addr: Address) => addr.is_default) || addresses[0];
        if (defaultAddr) {
          setSelectedAddress(defaultAddr);
        }
      }
    } catch (error) {
      console.error('Error fetching default address:', error);
    }
  };

  const calculateTotal = () => {
    let total = 0;
    localItems.forEach(item => {
      total += item.card.priceCash * item.quantity;
    });
    return total;
  };

  // Handle quantity change
  const handleQuantityChange = (cardId: string, newQuantity: number) => {
    setLocalItems(prev => {
      const newMap = new Map(prev);
      const item = newMap.get(cardId);
      if (item) {
        // Ensure quantity is between 1 and available stock
        const validQuantity = Math.max(1, Math.min(newQuantity, item.card.quantity));
        newMap.set(cardId, { ...item, quantity: validQuantity });
      }
      return newMap;
    });
  };

  // Remove item from cart
  const handleRemoveItem = (cardId: string) => {
    setLocalItems(prev => {
      const newMap = new Map(prev);
      newMap.delete(cardId);
      return newMap;
    });
  };

  // Handle card click to show detail modal
  const handleCardClick = (card: OfficialCard) => {
    // Convert OfficialCard to Card format for modal
    const cardData: Card = {
      id: card.id,
      name: card.card_name || 'Unknown Card',
      image_url: card.image_url || '/cards/common1.jpg.svg',
      rarity: card.rarity || 3,
      point_worth: card.pricePoints || 0,
      cash_worth: card.priceCash || 0,
      collection_id: card.collection_id || 'unknown'
    };
    
    setSelectedCard(cardData);
    setSelectedListing(card);
    setIsCardModalOpen(true);
  };

  const handleCheckoutClick = () => {
    if (localItems.size === 0) {
      toast.error('No items in cart');
      return;
    }
    if (!selectedAddress) {
      toast.error('Please select a shipping address');
      setIsAddressModalOpen(true);
      return;
    }
    // Show payment confirmation
    setIsPaymentConfirmModalOpen(true);
  };

  const handleAddressSelected = async (addressId: string) => {
    // Fetch the full address details
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const { getAuthHeaders } = await import('@/lib/authUtils');
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch(`${apiBaseUrl}/accounts/addresses`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });

      if (response.ok) {
        const data = await response.json();
        const address = data.addresses?.find((addr: Address) => addr.id === addressId);
        if (address) {
          setSelectedAddress(address);
        }
      }
    } catch (error) {
      console.error('Error fetching address:', error);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedAddress) {
      toast.error('Please select a shipping address');
      setIsPaymentConfirmModalOpen(false);
      setIsAddressModalOpen(true);
      return;
    }

    try {
      setLoading(true);
      
      // Prepare items array for API
      const items = Array.from(localItems.values()).map(item => ({
        collection_id: item.card.collection_id,
        card_id: item.card.id,
        quantity: item.quantity
      }));
      
      // Create Stripe checkout session with address
      const response = await paymentApi.createOfficialShopCheckout(items, selectedAddress.id);
      
      // Redirect to Stripe checkout
      if (response.session_url) {
        window.location.href = response.session_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Checkout failed:', error);
      toast.error(`Checkout failed: ${error?.response?.data?.detail || error?.message || 'Please try again'}`);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const itemsArray = Array.from(localItems.values());

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={onClose}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
      />
      
      {/* Modal - Slide up from bottom on mobile, centered on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div className="bg-[#1A1B2E] rounded-t-2xl sm:rounded-lg p-6 w-full sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up sm:animate-none">
        {/* Header with close button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Review Your Order</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {/* Items List */}
          <div className="space-y-3">
            {itemsArray.map((item) => (
              <div key={item.card.id} className="bg-[#2A2B3D] rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <div 
                    className="w-16 h-20 sm:w-20 sm:h-28 relative flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleCardClick(item.card)}
                  >
                    <Image
                      src={item.card.image_url || '/cards/common1.jpg.svg'}
                      alt={item.card.card_name}
                      fill
                      className="object-contain rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 
                      className="text-white font-medium mb-2 line-clamp-2 cursor-pointer hover:text-purple-400 transition-colors"
                      onClick={() => handleCardClick(item.card)}
                    >
                      {item.card.card_name}
                    </h3>
                    <div className="text-green-400 font-bold text-sm mb-2">
                      ${item.card.priceCash.toFixed(2)} each
                    </div>
                    
                    {/* Quantity Selector */}
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">Qty:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleQuantityChange(item.card.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-8 h-8 rounded bg-[#1A1B2E] text-white font-bold hover:bg-[#2A2B3D] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingQuantity[item.card.id] ?? item.quantity}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow empty string or numbers only
                            if (value === '' || /^\d+$/.test(value)) {
                              setEditingQuantity(prev => ({ ...prev, [item.card.id]: value }));
                              
                              // Update quantity if valid number
                              if (value !== '') {
                                const num = parseInt(value);
                                if (!isNaN(num)) {
                                  handleQuantityChange(item.card.id, num);
                                }
                              }
                            }
                          }}
                          onFocus={(e) => {
                            // Select all on focus for easy editing
                            e.target.select();
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            // If empty or invalid, reset to 1
                            if (value === '' || isNaN(parseInt(value)) || parseInt(value) < 1) {
                              handleQuantityChange(item.card.id, 1);
                            }
                            // Clear editing state
                            setEditingQuantity(prev => {
                              const newState = { ...prev };
                              delete newState[item.card.id];
                              return newState;
                            });
                          }}
                          className="w-12 h-8 text-center bg-[#1A1B2E] text-white font-medium rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
                        />
                        <button
                          onClick={() => handleQuantityChange(item.card.id, item.quantity + 1)}
                          disabled={item.quantity >= item.card.quantity}
                          className="w-8 h-8 rounded bg-[#1A1B2E] text-white font-bold hover:bg-[#2A2B3D] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-gray-500 text-xs">/ {item.card.quantity}</span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <button
                      onClick={() => handleRemoveItem(item.card.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <div className="text-white font-bold text-lg">
                      ${(item.card.priceCash * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Shipping Address */}
          <div className="bg-[#2A2B3D] rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Shipping Address</h3>
            {selectedAddress ? (
              <div className="text-gray-300 text-sm space-y-1">
                {selectedAddress.name && <p className="font-medium text-white">{selectedAddress.name}</p>}
                <p>{selectedAddress.line1}</p>
                {selectedAddress.line2 && <p>{selectedAddress.line2}</p>}
                <p>{selectedAddress.city}, {selectedAddress.state} {selectedAddress.postal_code}</p>
                <p>{selectedAddress.country}</p>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => setIsAddAddressModalOpen(true)}
                    className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
                  >
                    Add Address
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={() => setIsEditAddressModalOpen(true)}
                    className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
                  >
                    Edit Address
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-3">No address selected</p>
                <button
                  onClick={() => setIsAddAddressModalOpen(true)}
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Add Address
                </button>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="border-t border-gray-600 pt-4">
            <div className="flex justify-between items-center mb-4">
              <div className="text-white">
                <div className="text-sm text-gray-400">Total Items</div>
                <div className="text-lg font-semibold">{localItems.size} item{localItems.size > 1 ? 's' : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">Total Amount</div>
                <div className="text-2xl font-bold text-green-400">${calculateTotal().toFixed(2)}</div>
              </div>
            </div>

          </div>
        </div>

        <div className="border-t border-gray-600 pt-4 mt-4">
          <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCheckoutClick}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            Checkout - ${calculateTotal().toFixed(2)}
          </button>
          </div>
        </div>
      </div>
      </div>
      
      {/* Card Detail Modal */}
      <CardDetailModal
        card={selectedCard}
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        channel="official"
        userId={userId || ''}
        listingId={selectedCard?.id}
        listing={selectedListing}
        readOnly={true}
      />
      
      {/* Select Address Modal */}
      <SelectAddressModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        onSelect={handleAddressSelected}
      />
      
      {/* Add Address Modal */}
      <AddressModal 
        isOpen={isAddAddressModalOpen}
        onClose={() => setIsAddAddressModalOpen(false)}
        onSave={async (data, skipValidation = false) => {
          const userId = getCurrentUserId();
          if (!userId) {
            throw new Error('User not logged in');
          }
          
          // Use AddressBuilder to build address data in API format
          const addressWithId = AddressBuilder.buildFromForm(data);
          
          // Add to API with skipValidation parameter
          const result = await userApi.addAddress(addressWithId, skipValidation);
          
          // Refresh and select the newly added address
          await fetchDefaultAddress();
          
          // Find and select the newly added address
          if (result && result.user && result.user.addresses) {
            const newAddress = result.user.addresses.find((addr: any) => 
              addr.name === addressWithId.name && 
              addr.street === addressWithId.street && 
              addr.city === addressWithId.city
            );
            if (newAddress) {
              setSelectedAddress({
                id: newAddress.id,
                name: newAddress.name,
                line1: newAddress.street,
                line2: newAddress.street2,
                city: newAddress.city,
                state: newAddress.state,
                postal_code: newAddress.zip,
                country: newAddress.country
              });
            }
          }
          
          toast.success('Address added successfully');
        }}
        title="ADD NEW ADDRESS"
      />

      {/* Edit Address Modal */}
      <AddressModal 
        isOpen={isEditAddressModalOpen}
        onClose={() => setIsEditAddressModalOpen(false)}
        onSave={async (data, skipValidation = false) => {
          const userId = getCurrentUserId();
          if (!userId) {
            throw new Error('User not logged in');
          }
          
          if (!selectedAddress || !selectedAddress.id) {
            throw new Error('No address to edit');
          }
          
          // Use AddressBuilder to build address data in API format
          const updatedAddress = AddressBuilder.buildFromForm(data);
          
          // Update the address
          const result = await userApi.updateAddress(selectedAddress.id.toString(), updatedAddress, skipValidation);
          
          // Refresh addresses
          await fetchDefaultAddress();
          
          // Update selected address with edited data
          if (result && result.user && result.user.addresses) {
            const editedAddress = result.user.addresses.find((addr: any) => 
              addr.id.toString() === selectedAddress.id.toString()
            );
            if (editedAddress) {
              setSelectedAddress({
                id: editedAddress.id,
                name: editedAddress.name,
                line1: editedAddress.street,
                line2: editedAddress.street2,
                city: editedAddress.city,
                state: editedAddress.state,
                postal_code: editedAddress.zip,
                country: editedAddress.country
              });
            }
          }
          
          toast.success('Address updated successfully');
        }}
        address={selectedAddress ? {
          id: selectedAddress.id,
          name: selectedAddress.name || '',
          street: selectedAddress.line1,
          street2: selectedAddress.line2,
          city: selectedAddress.city,
          state: selectedAddress.state,
          zip: selectedAddress.postal_code,
          country: selectedAddress.country
        } : undefined}
        title="EDIT ADDRESS"
      />
      
      {/* Payment Confirmation Modal */}
      <PaymentConfirmationModal
        isOpen={isPaymentConfirmModalOpen}
        onClose={() => setIsPaymentConfirmModalOpen(false)}
        subtotal={calculateTotal()}
        itemCount={localItems.size}
        onConfirm={handleConfirmPayment}
      />
    </>
  );
}
