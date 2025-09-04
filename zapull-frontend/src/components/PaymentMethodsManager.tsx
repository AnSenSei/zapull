'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { paymentApi } from '@/lib/paymentApi'
import { getCurrentUserId } from '@/lib/authUtils'
import CreditCardModal from './CreditCardModal'

interface PaymentMethod {
  id: string
  type: string
  card?: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  }
  is_default: boolean
  created_at?: string
}

export default function PaymentMethodsManager() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load payment methods
  const loadPaymentMethods = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const userId = getCurrentUserId()
      
      if (!userId) {
        setError('Please login first')
        return
      }

      const response = await paymentApi.getPaymentMethods()
      setPaymentMethods(response.payment_methods || [])
    } catch (error) {
      console.error('Failed to load payment methods:', error)
      setError('Failed to load payment methods')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPaymentMethods()
  }, [])

  // Handle delete payment method
  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    try {
      setIsDeleting(paymentMethodId)
      await paymentApi.deletePaymentMethod(paymentMethodId)
      
      // Reload payment methods
      await loadPaymentMethods()
      setShowDeleteConfirm(null)
    } catch (error) {
      console.error('Failed to delete payment method:', error)
      setError('Failed to delete payment method')
    } finally {
      setIsDeleting(null)
    }
  }

  // Get card brand icon/color
  const getCardBrandStyle = (brand: string) => {
    const brandLower = brand?.toLowerCase() || ''
    switch (brandLower) {
      case 'visa':
        return { icon: '/payment/visaIcon.png', color: 'from-blue-500 to-blue-600' }
      case 'mastercard':
        return { icon: '/payment/visaIcon.png', color: 'from-red-500 to-orange-500' }
      case 'amex':
      case 'american express':
        return { icon: '/payment/visaIcon.png', color: 'from-green-500 to-teal-500' }
      case 'discover':
        return { icon: '/payment/visaIcon.png', color: 'from-orange-500 to-yellow-500' }
      default:
        return { icon: '/payment/visaIcon.png', color: 'from-gray-500 to-gray-600' }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Payment Methods</h3>
          <button
            onClick={() => setShowAddCard(true)}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-all duration-200"
          >
            Add Card
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-800">
            {error}
          </div>
        )}

        {/* Payment methods list */}
        {paymentMethods.length === 0 ? (
          <div className="text-center py-12 bg-gray-800/50 rounded-lg">
            <div className="text-4xl mb-4">💳</div>
            <h3 className="text-lg font-medium text-white mb-2">No payment methods</h3>
            <p className="text-gray-400 mb-6">Add a payment method for quick checkout</p>
            <button
              onClick={() => setShowAddCard(true)}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200"
            >
              Add Payment Method
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            <AnimatePresence>
              {paymentMethods.map((method) => {
                const brandStyle = getCardBrandStyle(method.card?.brand || '')
                return (
                  <motion.div
                    key={method.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="relative bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-4 border border-purple-500/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {/* Card icon */}
                        <div className={`w-16 h-10 rounded bg-gradient-to-r ${brandStyle.color} flex items-center justify-center`}>
                          <span className="text-white font-bold text-xs">
                            {method.card?.brand?.toUpperCase()}
                          </span>
                        </div>
                        
                        {/* Card details */}
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-white font-medium">
                              •••• {method.card?.last4}
                            </span>
                            {method.is_default && (
                              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">
                            Expires {method.card?.exp_month?.toString().padStart(2, '0')}/{method.card?.exp_year}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        {!method.is_default && (
                          <button
                            onClick={() => paymentApi.setDefaultPaymentMethod(method.id).then(loadPaymentMethods)}
                            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => setShowDeleteConfirm(method.id)}
                          disabled={isDeleting === method.id}
                          className="px-3 py-1 text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                          {isDeleting === method.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {/* Delete confirmation */}
                    <AnimatePresence>
                      {showDeleteConfirm === method.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-gray-700"
                        >
                          <p className="text-sm text-gray-300 mb-3">
                            Are you sure you want to delete this payment method?
                          </p>
                          <div className="flex space-x-3">
                            <button
                              onClick={() => handleDeletePaymentMethod(method.id)}
                              disabled={isDeleting === method.id}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              {isDeleting === method.id ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(null)}
                              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Add payment method modal */}
      <CreditCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onSuccess={() => {
          setShowAddCard(false)
          loadPaymentMethods()
        }}
        mode="add-payment-method"
      />
    </>
  )
}