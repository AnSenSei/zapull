'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface AddressSuggestion {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

interface AddressSuggestionModalProps {
  isOpen: boolean
  onClose: () => void
  onAccept: () => void
  onReject: () => void
  originalAddress: AddressSuggestion
  suggestedAddress: AddressSuggestion
}

export default function AddressSuggestionModal({
  isOpen,
  onClose,
  onAccept,
  onReject,
  originalAddress,
  suggestedAddress
}: AddressSuggestionModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[1000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-[#1A1B2E] rounded-lg p-6"
        style={{
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          border: '2px solid #8B5CF6'
        }}
      >
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white">Address Validation</h2>
          <p className="text-gray-400 text-sm mt-2">
            We found a suggested address for more accurate delivery
          </p>
        </div>

        {/* Address Comparison */}
        <div className="space-y-4">
          {/* Original Address */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">You entered:</h3>
            <div className="text-white text-sm space-y-1">
              <p>{originalAddress.street}</p>
              <p>{originalAddress.city}, {originalAddress.state} {originalAddress.zip}</p>
              <p>{originalAddress.country}</p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>

          {/* Suggested Address */}
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-400 mb-2">Suggested:</h3>
            <div className="text-white text-sm space-y-1">
              <p>{suggestedAddress.street}</p>
              <p>
                {suggestedAddress.city !== originalAddress.city && (
                  <span className="bg-purple-600/30 px-1 rounded">{suggestedAddress.city}</span>
                )}
                {suggestedAddress.city === originalAddress.city && suggestedAddress.city}
                {', '}
                {suggestedAddress.state !== originalAddress.state && (
                  <span className="bg-purple-600/30 px-1 rounded">{suggestedAddress.state}</span>
                )}
                {suggestedAddress.state === originalAddress.state && suggestedAddress.state}
                {' '}
                {suggestedAddress.zip !== originalAddress.zip && (
                  <span className="bg-purple-600/30 px-1 rounded">{suggestedAddress.zip}</span>
                )}
                {suggestedAddress.zip === originalAddress.zip && suggestedAddress.zip}
              </p>
              <p>{suggestedAddress.country}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors"
          >
            Keep My Address
          </button>
          <button
            onClick={onAccept}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium transition-colors"
          >
            Use Suggested Address
          </button>
        </div>
      </motion.div>
    </div>
  )
}