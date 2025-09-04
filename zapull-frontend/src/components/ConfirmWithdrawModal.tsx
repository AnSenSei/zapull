'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { userApi } from '@/lib/userApi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { toastSuccess } from '@/lib/toast';
import AddressModal from './AddressModal';
import { AddressBuilder } from '@/lib/addressBuilder';
import { getCurrentUserId } from '@/lib/authUtils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock';
import CustomDropdown from './CustomDropdown';
import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import { UserCard } from '@/lib/userApi';

interface ConfirmWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardsToWithdraw: { card_id: string; card_name: string; quantity: number; subcollection_name: string }[];
  cards?: UserCard[];  // Add cards data to calculate point worth
  onConfirm: () => void;
}

export default function ConfirmWithdrawModal({ isOpen, onClose, cardsToWithdraw, cards = [], onConfirm }: ConfirmWithdrawModalProps) {
  const [loading, setLoading] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<any>(null);
  const [allAddresses, setAllAddresses] = useState<any[]>([]);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [isLoadingFee, setIsLoadingFee] = useState(false);
  const [feeInfo, setFeeInfo] = useState<any>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>('+1'); // Default to US
  const [phoneError, setPhoneError] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { userInfo, updateUserInfo } = useAuthStore();
  const calculatingFeeRef = useRef(false);
  const phoneUtil = PhoneNumberUtil.getInstance();

  // Supported shipping countries with their phone codes
  const supportedCountries = [
    { id: '+1', name: 'US/CA (+1)' },
    { id: '+44', name: 'UK (+44)' },
    { id: '+52', name: 'Mexico (+52)' },
    { id: '+49', name: 'Germany (+49)' },
    { id: '+33', name: 'France (+33)' },
    { id: '+61', name: 'Australia (+61)' },
    { id: '+39', name: 'Italy (+39)' }
  ];

  useEffect(() => {
    if (isOpen) {
      // Lock body scroll and load user's shipping address
      lockBodyScroll();
      fetchUserAddress();
    } else {
      // Reset states when modal closes
      setIsLoadingFee(false);
      setShippingFee(null);
      setFeeInfo(null);
      setPhoneNumber('');
      setPhoneError('');
      setPhoneCountryCode('+1');
    }

    // Always unlock when closing or unmounting
    return () => {
      if (isOpen) {
        unlockBodyScroll();
      }
    };
  }, [isOpen]); // Removed userInfo to prevent infinite loop


  useEffect(() => {
    if (isOpen && shippingAddress && shippingAddress.country) {
      // Calculate shipping fee when address is available
      calculateShippingFee();
    }
  }, [shippingAddress?.id, shippingAddress?.country, cardsToWithdraw, cards]); // Recalculate when address or cards change

  const fetchUserAddress = async () => {
    try {
      // Get user's saved addresses
      const userInfoData = await userApi.getUserInfo();
      updateUserInfo(userInfoData);
      
      // Set all addresses and select the first one as default
      if (userInfoData && userInfoData.addresses && userInfoData.addresses.length > 0) {
        setAllAddresses(userInfoData.addresses);
        setShippingAddress(userInfoData.addresses[0]);
      } else {
        setAllAddresses([]);
        setShippingAddress(null);
      }
    } catch (error) {
      console.error('Failed to fetch address:', error);
      // Try to use cached data
      if (userInfo && userInfo.addresses && userInfo.addresses.length > 0) {
        setAllAddresses(userInfo.addresses);
        setShippingAddress(userInfo.addresses[0]);
      } else {
        setAllAddresses([]);
      }
    }
  };

  const calculateShippingFee = async () => {
    if (!shippingAddress || !shippingAddress.country) {
      setIsLoadingFee(false);
      return;
    }
    
    // Prevent duplicate API calls
    if (calculatingFeeRef.current) {
      return;
    }
    
    try {
      calculatingFeeRef.current = true;
      setIsLoadingFee(true);
      
      // Calculate actual total point worth of selected cards
      const totalValue = cardsToWithdraw.reduce((sum, withdrawCard) => {
        const cardData = cards?.find(c => c.card_name === withdrawCard.card_name);
        return sum + (cardData ? cardData.point_worth * withdrawCard.quantity : 0);
      }, 0);
      
      const feeData = await userApi.calculateWithdrawalFee(shippingAddress.country, totalValue);
      if (feeData) {
        setFeeInfo(feeData);
        setShippingFee(feeData.is_free_shipping ? 0 : feeData.fee);
      }
    } catch (error: any) {
      console.error('Failed to calculate shipping fee:', error);
      // Default to 550 points if calculation fails
      setShippingFee(550);
      setFeeInfo({
        zone: 1,
        fee: 550,
        free_shipping_threshold: 10000,
        is_free_shipping: false,
        country: shippingAddress.country
      });
    } finally {
      setIsLoadingFee(false);
      calculatingFeeRef.current = false;
    }
  };

  // Validate phone number using libphonenumber
  const validatePhoneNumber = (phone: string): { isValid: boolean; formatted: string; error: string } => {
    if (!phone || phone.trim() === '') {
      return { isValid: false, formatted: '', error: 'Phone number is required' };
    }

    try {
      // Combine country code and phone number
      const fullPhoneNumber = phoneCountryCode + phone.replace(/^\+/, ''); // Remove + if user added it
      
      // Try to parse the phone number
      let parsedNumber;
      try {
        parsedNumber = phoneUtil.parseAndKeepRawInput(fullPhoneNumber);
      } catch (e) {
        return { 
          isValid: false, 
          formatted: phone, 
          error: 'Please enter a valid phone number' 
        };
      }

      // Check if the number is valid
      if (!phoneUtil.isValidNumber(parsedNumber)) {
        return { 
          isValid: false, 
          formatted: phone, 
          error: 'Please enter a valid phone number' 
        };
      }

      // Format the number in international format
      const formatted = phoneUtil.format(parsedNumber, PhoneNumberFormat.INTERNATIONAL);
      return { isValid: true, formatted, error: '' };
    } catch (error) {
      return { 
        isValid: false, 
        formatted: phone, 
        error: 'Please enter a valid phone number' 
      };
    }
  };

  // Handle phone number change
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    
    // Clear error when user starts typing
    if (phoneError) {
      setPhoneError('');
    }
  };

  // Validate phone on blur
  const handlePhoneBlur = () => {
    if (phoneNumber) {
      const validation = validatePhoneNumber(phoneNumber);
      if (!validation.isValid) {
        setPhoneError(validation.error);
      } else {
        // Update with formatted number
        setPhoneNumber(validation.formatted);
        setPhoneError('');
      }
    }
  };

  const handleConfirm = async () => {
    if (!shippingAddress) {
      toast.error('Please add a shipping address before confirming withdrawal');
      return;
    }

    if (!shippingAddress.id) {
      toast.error('Invalid address. Please update your shipping address.');
      return;
    }

    // Validate phone number
    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error);
      toast.error(phoneValidation.error);
      return;
    }

    try {
      setLoading(true);
      
      // Resolve card IDs from cards prop, mirroring redeem flow behavior
      const resolvedCards = cardsToWithdraw.map((c) => {
        const match = cards?.find((x) => x.id === c.card_id || x.card_name === c.card_name);
        return { 
          card_id: match ? match.id : c.card_id, 
          quantity: c.quantity,
          subcollection_name: match ? match.subcollection_name : c.subcollection_name
        };
      });
      // Basic validation to avoid sending bad IDs like "psyduck"
      const uuidLike = /^[0-9a-fA-F-]{8,}$/;
      const hasInvalid = resolvedCards.some((rc) => !rc.card_id || !uuidLike.test(rc.card_id) || !rc.subcollection_name);
      if (hasInvalid) {
        toast.error('Unable to resolve one or more selected cards. Please re-select and try again.');
        setLoading(false);
        return;
      }

      // Create withdrawal request with formatted phone number
      const withdrawalData = {
        cards: resolvedCards,
        address_id: shippingAddress.id,
        phone_number: phoneValidation.formatted
      };

      await userApi.createWithdrawal(withdrawalData);
      
      onConfirm();
      onClose();
    } catch (error) {
      console.error('Failed to create withdrawal:', error);
      toast.error('Failed to create withdrawal request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalCards = cardsToWithdraw.reduce((sum, card) => sum + card.quantity, 0);
  
  // Calculate total point worth
  const totalPointWorth = cardsToWithdraw.reduce((sum, withdrawCard) => {
    // Prefer matching by id; fallback to name if needed
    const cardData = cards?.find(c => c.id === withdrawCard.card_id) || cards?.find(c => c.card_name === withdrawCard.card_name);
    return sum + (cardData ? cardData.point_worth * withdrawCard.quantity : 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col">
        <h2 className="text-2xl font-bold text-white mb-4">Confirm Withdrawal</h2>
        
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {/* Summary Section */}
          <div className="bg-[#2A2B3D] rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Withdrawal Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total Cards:</span>
                <span className="text-white">{totalCards}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total Point Worth:</span>
                <span className="text-white">{totalPointWorth.toLocaleString()} points</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Shipping Fee:</span>
                {!shippingAddress ? (
                  <span className="text-yellow-400">Choose address</span>
                ) : isLoadingFee || shippingFee === null ? (
                  <span className="text-gray-400">Calculating...</span>
                ) : (
                  <span className={shippingFee === 0 ? "text-green-400" : "text-white"}>
                    {shippingFee === 0 ? 'FREE' : `${shippingFee} points`}
                  </span>
                )}
              </div>
              {feeInfo && !feeInfo.is_free_shipping && (
                <div className="text-xs text-gray-400 mt-1">
                  Free shipping on orders over {feeInfo.free_shipping_threshold} points
                </div>
              )}
            </div>
          </div>

          {/* Shipping Address Section */}
          <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
            <h3 className="text-white font-medium mb-2">Shipping Address</h3>
            
            {/* Address dropdown if multiple addresses exist */}
            {allAddresses.length > 1 && (
              <div className="mb-3">
                <CustomDropdown
                  value={shippingAddress?.id?.toString() || ''}
                  onChange={(value) => {
                    const selectedAddr = allAddresses.find(addr => addr.id.toString() === value);
                    if (selectedAddr) {
                      setShippingAddress(selectedAddr);
                    }
                  }}
                  options={allAddresses.map(addr => ({
                    id: addr.id.toString(),
                    name: `${addr.name} - ${addr.street}, ${addr.city}`
                  }))}
                  placeholder="Select Address"
                  className="w-full"
                />
              </div>
            )}
            
            {shippingAddress ? (
              <div className="text-sm text-gray-300">
                <p>{shippingAddress.name}</p>
                <p>{shippingAddress.street}</p>
                <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.zip}</p>
                <p>{shippingAddress.country}</p>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No shipping address found. Please add one.</p>
            )}
            <div className="flex gap-2 mt-2">
              <button 
                className="text-[#8868FF] text-sm hover:underline"
                onClick={() => setIsAddModalOpen(true)}
              >
                Add Address
              </button>
              {shippingAddress && (
                <>
                  <span className="text-gray-500">|</span>
                  <button 
                    className="text-[#8868FF] text-sm hover:underline"
                    onClick={() => setIsEditModalOpen(true)}
                  >
                    Edit Address
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Phone Number Section */}
          <div className="bg-[#2A2B3D] rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Phone Number for Shipping</h3>
            <div className="flex flex-col gap-2 md:flex-row">
              {/* Country Code Dropdown */}
              <CustomDropdown
                value={phoneCountryCode}
                onChange={setPhoneCountryCode}
                options={supportedCountries}
                placeholder="Code"
                className="w-full md:w-32"
              />
              
              {/* Phone Number Input */}
              <input
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneChange}
                onBlur={handlePhoneBlur}
                placeholder="Phone number"
                className={`flex-1 px-3 py-2 bg-[#1A1B2E] text-white rounded-lg border ${
                  phoneError ? 'border-red-500' : 'border-gray-600'
                } focus:border-[#8868FF] focus:outline-none`}
                required
              />
            </div>
            {phoneError && (
              <p className="text-xs text-red-400 mt-1">{phoneError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Required for shipping notifications
            </p>
          </div>

          {/* Cards to Withdraw */}
          <div className="bg-[#2A2B3D] rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Cards to Withdraw</h3>
            <div className="space-y-2">
              {cardsToWithdraw.map((card, index) => {
                const cardData = cards?.find(c => c.card_name === card.card_name);
                return (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-gray-300">
                      {cardData?.card_name || card.card_name}
                    </span>
                    <span className="text-white">x{card.quantity}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-600 pt-4">
          <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-3 mb-4">
            <p className="text-blue-400 text-sm">
              <strong>Important:</strong> Once confirmed, cards will be permanently removed from your digital inventory 
              and shipped to the address above. This action cannot be undone once the order is processed.
            </p>
            {feeInfo && (
              <p className="text-blue-400 text-sm mt-2">
                <strong>Shipping Fee:</strong> {feeInfo.zone === 1 ? 'US shipping' : 'International shipping'} - {feeInfo.fee} points. {' '}
                <Link href="/how-to-shipping" className="underline hover:text-blue-300">
                  Learn about shipping fees and how to get free shipping
                </Link>
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-4">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !shippingAddress}
              className="px-6 py-2 bg-[#8868FF] text-white rounded-lg hover:bg-[#7759EE] transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm Withdrawal'}
            </button>
          </div>
        </div>
      </div>

      {/* Add Address Modal */}
      <AddressModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data, skipValidation = false) => {
          const userId = getCurrentUserId();
          if (!userId) {
            throw new Error('User not logged in');
          }
          
          // Use AddressBuilder to build address data in API format
          const addressWithId = AddressBuilder.buildFromForm(data);
          
          // Add to API with skipValidation parameter - this will throw error if validation fails
          // The error will be caught by AddressModal which will show the suggestion modal
          const result = await userApi.addAddress(addressWithId, skipValidation);
          
          // Only execute these if save was successful
          // Refresh user addresses and get the newly added address
          await fetchUserAddress();
          
          // Find and select the newly added address
          // The result should have the user with updated addresses
          if (result && result.user && result.user.addresses) {
            // The newly added address should be the last one or we can find it by matching data
            const newAddress = result.user.addresses.find((addr: any) => 
              addr.name === addressWithId.name && 
              addr.street === addressWithId.street && 
              addr.city === addressWithId.city
            );
            if (newAddress) {
              setShippingAddress(newAddress);
            }
          }
          
          toastSuccess('Address added successfully');
        }}
        title="ADD NEW ADDRESS"
      />

      {/* Edit Address Modal */}
      <AddressModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async (data, skipValidation = false) => {
          const userId = getCurrentUserId();
          if (!userId) {
            throw new Error('User not logged in');
          }
          
          if (!shippingAddress || !shippingAddress.id) {
            throw new Error('No address to edit');
          }
          
          // Use AddressBuilder to build address data in API format
          const updatedAddress = AddressBuilder.buildFromForm(data);
          
          // Use the update endpoint instead of delete-then-add
          // This will validate the address and return suggested_address if validation fails
          // The AddressModal will catch this and show the suggestion modal
          const result = await userApi.updateAddress(shippingAddress.id.toString(), updatedAddress, skipValidation);
          
          // Refresh user addresses
          await fetchUserAddress();
          
          // Find and select the updated address
          // The result should have the user with updated addresses
          if (result && result.user && result.user.addresses) {
            // Find the updated address by ID
            const editedAddress = result.user.addresses.find((addr: any) => 
              addr.id.toString() === shippingAddress.id.toString()
            );
            if (editedAddress) {
              setShippingAddress(editedAddress);
            }
          }
          
          toastSuccess('Address updated successfully');
        }}
        address={shippingAddress}
        title="EDIT ADDRESS"
      />
    </div>
  );
}