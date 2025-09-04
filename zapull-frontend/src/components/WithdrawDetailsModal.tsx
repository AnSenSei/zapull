'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { userApi, WithdrawRequestDetails } from '@/lib/userApi';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

interface WithdrawDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  onUpdate: () => void;
}

export default function WithdrawDetailsModal({ isOpen, onClose, requestId, onUpdate }: WithdrawDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<WithdrawRequestDetails | null>(null);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [updating, setUpdating] = useState(false);
  const { userInfo } = useAuthStore();

  useEffect(() => {
    if (isOpen && requestId) {
      fetchDetails();
    }
  }, [isOpen, requestId]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await userApi.getWithdrawRequestDetails(requestId);
      setDetails(data);
      
      // Set initial address if available
      if (data.shipping_address?.id) {
        setSelectedAddressId(data.shipping_address.id);
      }
    } catch (err) {
      console.error('Failed to fetch withdrawal details:', err);
      setError('Failed to load withdrawal details');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setPhoneNumber('');
    // Set the current address as selected
    if (details?.shipping_address?.id) {
      setSelectedAddressId(details.shipping_address.id);
    }
  };

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      
      const updateData: any = {};

      // Only include address_id if user selected a different address
      if (selectedAddressId && selectedAddressId !== details?.shipping_address?.id) {
        updateData.address_id = selectedAddressId;
      }

      // Only include phone_number if user entered one
      if (phoneNumber && phoneNumber.trim() !== '') {
        updateData.phone_number = phoneNumber.trim();
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        toast.error('Please change the address or phone number to update');
        return;
      }

      await userApi.updateWithdrawRequest(requestId, updateData);
      
      setIsEditing(false);
      onUpdate(); // Refresh the list
      fetchDetails(); // Refresh details
    } catch (error) {
      console.error('Failed to update withdrawal request:', error);
      toast.error('Failed to update withdrawal request');
    } finally {
      setUpdating(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'processing':
        return 'bg-blue-500/20 text-blue-500';
      case 'shipped':
        return 'bg-green-500/20 text-green-500';
      case 'delivered':
        return 'bg-green-600/20 text-green-600';
      case 'cancelled':
        return 'bg-red-500/20 text-red-500';
      case 'insufficient_funds':
        return 'bg-orange-500/20 text-orange-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  const totalValue = details?.cards.reduce((sum, card) => sum + (card.point_worth * card.quantity), 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Withdrawal Request Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="text-white">Loading...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 text-red-500 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {!loading && !error && details && (
          <div className="overflow-y-auto flex-1">
            {/* Request Info */}
            <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
              <h3 className="text-white font-medium mb-3">Request Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Status:</span>
                  <span className={`ml-2 inline-block px-2 py-1 rounded-full text-xs ${getStatusColor(details.status)}`}>
                    {details.status.charAt(0).toUpperCase() + details.status.slice(1)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white ml-2">{formatDate(details.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Total Cards:</span>
                  <span className="text-white ml-2">{details.card_count}</span>
                </div>
                <div>
                  <span className="text-gray-400">Total Value:</span>
                  <span className="text-white ml-2">{totalValue} points</span>
                </div>
              </div>
            </div>

            {/* Shipping Info */}
            {!isEditing && details.shipping_address && (
              <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
                <h3 className="text-white font-medium mb-3">Shipping Address</h3>
                <div className="text-sm text-gray-300">
                  <p>{details.shipping_address.name}</p>
                  <p>{details.shipping_address.street}</p>
                  <p>{details.shipping_address.city}, {details.shipping_address.state} {details.shipping_address.zip}</p>
                  <p>{details.shipping_address.country}</p>
                </div>
              </div>
            )}

            {/* Editable Shipping Info */}
            {isEditing && (
              <>
                <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
                  <h3 className="text-white font-medium mb-3">Shipping Address</h3>
                  <select
                    value={selectedAddressId}
                    onChange={(e) => setSelectedAddressId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1B2E] text-white rounded-lg border border-gray-600 focus:border-[#8868FF] focus:outline-none"
                  >
                    <option value="">Keep current address</option>
                    {userInfo?.addresses?.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.name} - {address.street}, {address.city}, {address.state} {address.zip}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Only select if you want to change the shipping address</p>
                </div>

                <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
                  <h3 className="text-white font-medium mb-3">Phone Number (Optional)</h3>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Enter new phone number (leave empty to keep current)"
                    className="w-full px-3 py-2 bg-[#1A1B2E] text-white rounded-lg border border-gray-600 focus:border-[#8868FF] focus:outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Only enter if you want to update the phone number</p>
                </div>
              </>
            )}

            {/* Tracking Info */}
            {!isEditing && details.tracking_number && (
              <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
                <h3 className="text-white font-medium mb-3">Tracking Information</h3>
                <div className="text-sm">
                  <span className="text-gray-400">Tracking Number:</span>
                  <a 
                    href={details.tracking_url || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline ml-2"
                  >
                    {details.tracking_number}
                  </a>
                </div>
              </div>
            )}

            {/* Cards List */}
            <div className="bg-[#2A2B3D] rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white font-medium">Cards in Request</h3>
                {details.status === 'pending' && !isEditing && (
                  <button
                    onClick={handleStartEdit}
                    className="px-3 py-1 bg-[#8868FF] text-white rounded-lg hover:bg-[#7759EE] transition-colors text-sm"
                  >
                    Edit Shipping Info
                  </button>
                )}
              </div>
              
              <div className="space-y-3">
                {details.cards.map((card) => (
                  <div key={card.id} className="bg-[#1A1B2E] rounded-lg p-3 flex items-center space-x-3">
                    {card.image_url && (
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <Image
                          src={card.image_url}
                          alt={card.card_name}
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{card.card_name}</p>
                      <p className="text-gray-400 text-xs">
                        {card.subcollection_name} • Worth: {card.point_worth} points
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-white">x{card.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="border-t border-gray-600 pt-4 mt-4">
          {isEditing ? (
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setIsEditing(false);
                  fetchDetails(); // Reset to original state
                }}
                disabled={updating}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="px-6 py-2 bg-[#8868FF] text-white rounded-lg hover:bg-[#7759EE] transition-colors disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}