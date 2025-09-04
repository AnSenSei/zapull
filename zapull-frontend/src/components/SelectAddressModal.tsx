'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentUserId, getAuthHeaders } from '@/lib/authUtils'

interface Address {
  id: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
  is_default?: boolean
}

interface SelectAddressModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (addressId: string) => void
}

export default function SelectAddressModal({ isOpen, onClose, onSelect }: SelectAddressModalProps) {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchAddresses()
    }
  }, [isOpen])

  const fetchAddresses = async () => {
    try {
      setLoading(true)
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1'
      const authHeaders = await getAuthHeaders()
      
      const response = await fetch(`${apiBaseUrl}/accounts/addresses`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      })

      if (response.ok) {
        const data = await response.json()
        setAddresses(data.addresses || [])
        
        // Pre-select default address
        const defaultAddress = data.addresses?.find((addr: Address) => addr.is_default)
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id)
        }
      } else {
        console.error('Failed to fetch addresses')
      }
    } catch (error) {
      console.error('Error fetching addresses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = () => {
    if (selectedAddressId) {
      onSelect(selectedAddressId)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-70" onClick={onClose} />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-md transform overflow-hidden rounded-2xl"
            style={{
              background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
              border: '2px solid #8B5CF6'
            }}
          >
            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-4">Select Shipping Address</h2>
              
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B5CF6]"></div>
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No addresses found</p>
                  <a
                    href="/user/address"
                    className="text-[#8B5CF6] hover:text-[#7C3AED] underline"
                  >
                    Add a shipping address
                  </a>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`block p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedAddressId === address.id
                            ? 'border-[#8B5CF6] bg-[#8B5CF6]/10'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="address"
                          value={address.id}
                          checked={selectedAddressId === address.id}
                          onChange={() => setSelectedAddressId(address.id)}
                          className="sr-only"
                        />
                        <div className="text-white">
                          <p className="font-medium">{address.line1}</p>
                          {address.line2 && <p className="text-sm text-gray-300">{address.line2}</p>}
                          <p className="text-sm text-gray-300">
                            {address.city}, {address.state} {address.postal_code}
                          </p>
                          <p className="text-sm text-gray-300">{address.country}</p>
                          {address.is_default && (
                            <span className="inline-block mt-2 px-2 py-1 bg-[#8B5CF6]/20 text-[#8B5CF6] text-xs rounded">
                              Default
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={handleConfirm}
                      disabled={!selectedAddressId}
                      className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                        selectedAddressId
                          ? 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED]'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  )
}