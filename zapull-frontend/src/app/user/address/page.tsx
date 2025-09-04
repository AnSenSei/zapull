'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AddressModal from '@/components/AddressModal'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated, getCurrentUserId } from '@/lib/authUtils'
import { userApi } from '@/lib/userApi'
import { AddressBuilder } from '@/lib/addressBuilder'

export default function AddressPage() {
  const router = useRouter()
  const { userInfo, updateUserInfo, authInitialized } = useAuthStore()
  const [addresses, setAddresses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [currentAddress, setCurrentAddress] = useState<any>(null)
  
  // Function to fetch user addresses
  const fetchUserAddresses = async () => {
    setLoading(true);
    setError('');
    
    try {
      const userId = getCurrentUserId();
      if (!userId) {
        setError('User not logged in');
        // Open login modal from auth store
        const { openLoginModal } = useAuthStore.getState();
        openLoginModal();
        // Redirect to home page
        router.push('/');
        return;
      }
      
      // Get latest user info from API
      const userInfoData = await userApi.getUserInfo();
      
      // Update global state
      updateUserInfo(userInfoData);
      
      // Update local address list
      if (userInfoData && userInfoData.addresses) {
        setAddresses(userInfoData.addresses);
      } else {
        setAddresses([]);
      }
    } catch (err) {
      console.error('Failed to fetch user addresses:', err);
      setError('Failed to fetch user addresses, please try again later');
      
      // If there's cached user info, use cached data
      if (userInfo && userInfo.addresses) {
        setAddresses(userInfo.addresses);
      } else {
        setAddresses([]);
      }
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    // Wait for auth initialization before checking authentication
    if (!authInitialized) {
      return;
    }
    
    // Check if user is logged in
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
      return;
    }
    
    // Fetch user addresses
    fetchUserAddresses();
  }, [router, authInitialized]);

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Your Addresses</h1>
        {/* Refresh button */}
        <button 
          onClick={fetchUserAddresses}
          className="bg-[#3F3F5F] hover:bg-[#4B4B6A] text-white px-3 py-1 rounded-md text-sm transition-colors flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 text-white px-4 py-3 rounded-lg mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {/* Loading state */}
      {loading || !authInitialized ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8B5CF6]"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Add address card */}
        <div className="border border-dashed border-gray-600 rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center h-[180px] sm:h-[200px] cursor-pointer hover:bg-[#2A2B3D]/30 transition-colors"
          onClick={() => setIsAddModalOpen(true)}
        >
          <div className="w-12 h-12 rounded-full bg-[#2A2B3D] flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-center text-gray-400">Add Address</p>
        </div>

        {/* Existing address cards */}
        {addresses.map(address => (
          <div key={address.id} className="bg-[#2A2B3D] rounded-lg p-4 sm:p-6 relative">
            <div className="mb-4">
              <h3 className="font-semibold">{address.name}</h3>
              <p className="text-gray-400">{address.street}</p>
              <p className="text-gray-400">{address.city}, {address.state} {address.zip}</p>
              <p className="text-gray-400">{address.country}</p>
            </div>
            <div className="flex space-x-2 absolute bottom-3 sm:bottom-4 right-3 sm:right-4">
              <button 
                onClick={async () => {
                  if (confirm('Are you sure you want to remove this address?')) {
                    try {
                      const userId = getCurrentUserId();
                      if (!userId) {
                        setError('User not logged in');
                        return;
                      }
                      
                      // Delete address from API
                      await userApi.deleteAddress(address.id.toString());
                      
                      // Refetch user addresses
                      fetchUserAddresses();
                    } catch (err) {
                      console.error('Failed to delete address:', err);
                      setError('Failed to delete address, please try again later');
                    }
                  }
                }}
                className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-3 py-1 rounded-md text-sm transition-colors"
              >
                Remove
              </button>
              <button 
                onClick={() => {
                  setCurrentAddress(address)
                  setIsEditModalOpen(true)
                }}
                className="bg-[#3F3F5F] hover:bg-[#4B4B6A] text-white px-3 py-1 rounded-md text-sm transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Add address modal */}
      <AddressModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data, skipValidation = false) => {
          const userId = getCurrentUserId();
          if (!userId) {
            setError('User not logged in');
            throw new Error('User not logged in');
          }
          
          // Use AddressBuilder to build address data in API format
          const addressWithId = AddressBuilder.buildFromForm(data);
          
          // Add to API with skipValidation parameter
          await userApi.addAddress(addressWithId, skipValidation);
          
          // 重新获取用户地址信息
          fetchUserAddresses();
        }}
        title="ADD NEW ADDRESS"
      />

      {/* Edit address modal */}
      <AddressModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async (data, skipValidation = false) => {
          const userId = getCurrentUserId();
          if (!userId) {
            setError('User not logged in');
            throw new Error('User not logged in');
          }
          
          // Use AddressBuilder to build address data in API format
          const updatedAddress = AddressBuilder.buildFromForm(data);
          
          // Use the update endpoint instead of delete-then-add
          // This will validate the address and return suggested_address if validation fails
          // The AddressModal will catch this and show the suggestion modal
          await userApi.updateAddress(currentAddress.id.toString(), updatedAddress, skipValidation);
          
          // 重新获取用户地址信息
          fetchUserAddresses();
        }}
        address={currentAddress}
        title="EDIT THE ADDRESS"
      />
    </div>
  )
}