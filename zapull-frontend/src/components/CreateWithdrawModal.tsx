'use client';

import { useState, useEffect } from 'react';
import { userApi, UserInfo } from '@/lib/userApi';
import toast from 'react-hot-toast';
import { toastSuccess } from '@/lib/toast';

interface CreateWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardsToWithdraw: { card_id?: string; card_name?: string; quantity: number; subcollection_name: string }[] | null;
  onSuccess: () => void;
}

export default function CreateWithdrawModal({ isOpen, onClose, cardsToWithdraw, onSuccess }: CreateWithdrawModalProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchUserInfo();
    }
  }, [isOpen]);

  const fetchUserInfo = async () => {
    try {
      const info = await userApi.getUserInfo();
      setUserInfo(info);
      if (info.addresses && info.addresses.length > 0) {
        setSelectedAddressId(info.addresses[0].id || '');
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const handleSubmit = async () => {
    if (!cardsToWithdraw || cardsToWithdraw.length === 0) {
      toast.error('No cards selected for withdrawal');
      return;
    }

    if (!selectedAddressId) {
      toast.error('Please select a shipping address');
      return;
    }

    if (!phoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    try {
      setLoading(true);
      await userApi.createWithdrawRequest({
        cards: cardsToWithdraw,
        address_id: selectedAddressId,
        phone_number: phoneNumber
      });
      
      toastSuccess('Withdrawal request created successfully!');
      
      // Clear pending cards from sessionStorage
      sessionStorage.removeItem('pendingWithdrawCards');
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create withdrawal request:', error);
      toast.error(`Failed to create withdrawal request: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-4">Complete Withdrawal Request</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Shipping Address
            </label>
            {userInfo?.addresses && userInfo.addresses.length > 0 ? (
              <select
                value={selectedAddressId}
                onChange={(e) => setSelectedAddressId(e.target.value)}
                className="w-full px-3 py-2 bg-[#2A2B3D] border border-gray-600 rounded text-white"
              >
                {userInfo.addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.name}, {address.street}, {address.city}, {address.state} {address.zip}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-gray-400">
                No addresses found. <a href="/user/address" className="text-[#8868FF] hover:underline">Add an address</a>
              </div>
            )}
          </div>

          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter phone number"
              className="w-full px-3 py-2 bg-[#2A2B3D] border border-gray-600 rounded text-white placeholder-gray-400"
            />
          </div>

          <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-3">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> You are about to withdraw {cardsToWithdraw?.length || 0} card(s). 
              These cards will be shipped to your address and removed from your digital inventory.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-[#8868FF] text-white rounded-lg hover:bg-[#7759EE] transition-colors disabled:opacity-50"
            disabled={loading || !selectedAddressId}
          >
            {loading ? 'Creating...' : 'Create Withdrawal Request'}
          </button>
        </div>
      </div>
    </div>
  );
}