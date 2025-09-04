'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getUserPaymentMethods, getStripe } from '@/lib/stripeIntegration'
import { PaymentMethod } from '@/lib/paymentApi'
import paymentApi from '@/lib/paymentApi'
import CreditCardModal from './CreditCardModal'
import { toastSuccess } from '@/lib/toast'
import toast from 'react-hot-toast'

interface MarketplacePaymentModalProps {
  isOpen: boolean
  onClose: () => void
  listing: {
    id: string
    card_name: string
    image_url: string
    priceCash?: number
  }
  offer?: {
    offerreference: string
    amount: number
  }
  buyerAddressId: string
  onSuccess: () => void
}

// Helper component to confirm PaymentElement payments in marketplace
function WalletConfirmButton({ onError, onSuccess }: { onError: (msg: string) => void; onSuccess: (paymentIntentId?: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!stripe || !elements) return
    setSubmitting(true)
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.origin + '/payment-success' : undefined,
        },
        redirect: 'if_required'
      })
      if (error) {
        onError(error.message || 'Payment failed')
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id)
      }
    } catch (e: any) {
      onError(e.message || 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <button className="mt-3 w-full py-2 rounded bg-[#8868FF] text-white disabled:bg-gray-600" disabled={!stripe || !elements || submitting} onClick={submit}>
      {submitting ? 'Processing...' : 'Pay with Wallet/Card'}
    </button>
  )
}

export default function MarketplacePaymentModal({
  isOpen,
  onClose,
  listing,
  offer,
  buyerAddressId,
  onSuccess
}: MarketplacePaymentModalProps) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const WALLET_METHOD_ID = 'WALLET'
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [showCreditCardModal, setShowCreditCardModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false)
  const [processingStep, setProcessingStep] = useState<'idle' | 'creating' | 'confirming' | 'success'>('idle')
  // Mobile detection and Wallet/PaymentElement support
  const [isMobile, setIsMobile] = useState(false)
  const [walletClientSecret, setWalletClientSecret] = useState<string | null>(null)
  const [walletLabel, setWalletLabel] = useState<'Apple Pay' | 'Google Pay' | null>(null)
  const stripePromise = getStripe()

  // Calculate the payment amount
  const paymentAmount = offer ? offer.amount : (listing?.priceCash || 0)

  // Load payment methods
  const loadPaymentMethods = async () => {
    try {
      setLoadingPaymentMethods(true)
      const response = await getUserPaymentMethods()
      setPaymentMethods(response.payment_methods)
      
      // Auto-select default or first payment method
      if (response.default_payment_method_id) {
        setSelectedPaymentMethod(response.default_payment_method_id)
      } else if (response.payment_methods.length > 0) {
        setSelectedPaymentMethod(response.payment_methods[0].id)
      }
    } catch (error) {
      console.error('Failed to get payment methods:', error)
      setError('Failed to load payment methods')
    } finally {
      setLoadingPaymentMethods(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadPaymentMethods()
      setError(null)
      setProcessingStep('idle')
    }
  }, [isOpen])

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640)
    checkMobile()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkMobile)
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])

  // Create a marketplace PaymentIntent for PaymentElement wallets when modal opens
  useEffect(() => {
    const createWalletPI = async () => {
      try {
        if (!isOpen || !listing?.id || !buyerAddressId) return
        const pi = await paymentApi.createMarketplacePaymentIntent({
          listing_id: listing.id,
          buyer_address_id: buyerAddressId,
          offer_id: offer?.offerreference
        })
        if (pi?.client_secret) {
          setWalletClientSecret(pi.client_secret)
          // Determine wallet label
          let label: 'Apple Pay' | 'Google Pay' | null = null
          try {
            // @ts-ignore
            if (typeof window !== 'undefined' && (window as any).ApplePaySession && (window as any).ApplePaySession.canMakePayments()) {
              label = 'Apple Pay'
            }
          } catch {}
          if (!label) label = 'Google Pay'
          setWalletLabel(label)
        } else {
          setWalletLabel(null)
        }
      } catch (e: any) {
        console.error('Failed to create marketplace PI for wallet:', e)
        // Backend-friendly error surfacing for Buy Now when listing is already accepted
        const status = e?.response?.status
        const detail: string | undefined = e?.response?.data?.detail || e?.response?.data?.message
        if (status === 400 && detail && /accepted offer/i.test(detail)) {
          toast.error('This listing already has an accepted offer')
        }
        setWalletClientSecret(null)
        setWalletLabel(null)
      }
    }
    createWalletPI()
  }, [isOpen, listing?.id, buyerAddressId, offer?.offerreference])

  // Handle payment method selection
  const handlePaymentMethodSelect = (paymentMethodId: string) => {
    setSelectedPaymentMethod(paymentMethodId)
  }

  // Auto-select wallet when it's available and user has no saved cards
  useEffect(() => {
    if (
      isOpen &&
      walletClientSecret &&
      walletLabel &&
      (paymentMethods.length === 0 || !selectedPaymentMethod)
    ) {
      setSelectedPaymentMethod(WALLET_METHOD_ID)
    }
  }, [isOpen, walletClientSecret, walletLabel, paymentMethods.length, selectedPaymentMethod])

  // Handle add payment method
  const handleAddPaymentMethod = () => {
    setShowCreditCardModal(true)
  }

  // Handle payment
  const handlePayment = async () => {
    if (!selectedPaymentMethod) {
      setError('Please select a payment method')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setProcessingStep('creating')

      // If wallet selected, wallet confirmation is handled by the PaymentElement button below
      if (selectedPaymentMethod === WALLET_METHOD_ID) {
        return
      }

      // Create marketplace payment intent for card flow
      const paymentIntent = await paymentApi.createMarketplacePaymentIntent({
        listing_id: listing.id,
        buyer_address_id: buyerAddressId,
        offer_id: offer?.offerreference
      })

      if (!paymentIntent || !paymentIntent.client_secret) {
        throw new Error('Failed to create payment intent')
      }

      setProcessingStep('confirming')

      // Initialize Stripe
      const stripe = await getStripe()
      
      if (!stripe) {
        throw new Error('Stripe initialization failed')
      }

      // Confirm the payment with saved card
      const { error: confirmError, paymentIntent: confirmedPaymentIntent } = await stripe.confirmCardPayment(
        paymentIntent.client_secret,
        {
          payment_method: selectedPaymentMethod
        }
      )

      if (confirmError) {
        throw new Error(confirmError.message || 'Payment confirmation failed')
      }

      // Check payment status
      if (confirmedPaymentIntent?.status === 'succeeded') {
        setError(null)
        setProcessingStep('success')
        toastSuccess('Payment successful!')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      } else if (confirmedPaymentIntent?.status === 'processing') {
        setError('Payment is processing, please check later')
      } else {
        setError(`Payment failed: ${confirmedPaymentIntent?.status || 'unknown status'}`)
      }

    } catch (error: any) {
      console.error('Payment failed:', error)
      // Prefer backend detail when available
      const status = error?.response?.status
      const detail: string | undefined = error?.response?.data?.detail || error?.response?.data?.message
      if (status === 400 && detail && /accepted offer/i.test(detail)) {
        toast.error('This listing already has an accepted offer')
        setError('This listing already has an accepted offer')
      } else if (detail) {
        toast.error(detail)
        setError(detail)
      } else {
        setError(error instanceof Error ? error.message : 'Payment failed, please try again')
      }
      setProcessingStep('idle')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle credit card modal close
  const handleCreditCardModalClose = () => {
    setShowCreditCardModal(false)
    loadPaymentMethods() // Refresh payment methods after adding a new one
  }

  if (!isOpen || !listing) return null

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-[#1C1B29] rounded-[20px] max-w-2xl w-full max-h-[90vh] overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              borderRadius: '20px',
              border: '1px solid rgba(139, 92, 246, 0.3)'
            }}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-700 sticky top-0 bg-[#1C1B29] z-10">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Complete Payment</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Success State */}
              {processingStep === 'success' ? (
                <div className="text-center py-12">
                  <div className="text-green-500 text-6xl mb-4">✓</div>
                  <h3 className="text-2xl font-bold text-white mb-2">Payment Successful!</h3>
                  <p className="text-gray-300">Your payment has been processed successfully.</p>
                </div>
              ) : (
                <>
                  {/* Card Info */}
                  <div className="bg-[#2A2B3D] rounded-lg p-4 mb-6 flex items-center space-x-4">
                    <Image 
                      src={listing.image_url} 
                      alt={listing.card_name} 
                      width={80} 
                      height={80} 
                      className="rounded-lg"
                    />
                    <div className="flex-1">
                      <h3 className="text-white font-medium text-lg">{listing.card_name}</h3>
                      <p className="text-gray-400 text-sm">
                        {offer ? 'Accepted Offer' : 'Buy Now'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-2xl font-bold">${paymentAmount.toFixed(2)}</p>
                      <p className="text-gray-400 text-sm">USD</p>
                    </div>
                  </div>
                  
                  {/* Error display */}
                  {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                      <p className="text-red-300 text-sm">{error}</p>
                    </div>
                  )}

                  {/* Payment Method Selection */}
                  <div className="mb-6">
                    <p className="text-white mb-3 font-medium">Select Payment Method</p>
                    
                    {loadingPaymentMethods ? (
                      <div className="text-gray-400 text-sm">Loading payment methods...</div>
                    ) : (
                      <div className="space-y-2">
                        {/* Saved cards (if any) */}
                        {paymentMethods.length > 0 && (
                          <>
                            {paymentMethods.map((method) => (
                              <div 
                                key={method.id}
                                className="relative p-4 cursor-pointer flex items-center"
                                style={{
                                  background: selectedPaymentMethod === method.id 
                                    ? 'rgba(136,104,255,0.2)' 
                                    : 'rgba(136,104,255,0.1)',
                                  borderRadius: '10px',
                                  border: selectedPaymentMethod === method.id 
                                    ? '2px solid #8868FF' 
                                    : '1px solid #8868FF'
                                }}
                                onClick={() => handlePaymentMethodSelect(method.id)}
                              >
                                {/* Selection indicator */}
                                <div className="w-5 h-5 flex items-center justify-center"
                                  style={{
                                    background: selectedPaymentMethod === method.id ? '#8868FF' : 'transparent',
                                    borderRadius: '50%',
                                    border: '2px solid #8868FF'
                                  }}
                                >
                                  {selectedPaymentMethod === method.id && (
                                    <div className="w-2 h-2 bg-white rounded-full"></div>
                                  )}
                                </div>
                                
                                <div className="flex items-center ml-3">
                                  <span className="text-white text-sm font-medium">
                                    {method.card.brand.toUpperCase()} •••• {method.card.last4}
                                  </span>
                                  {method.card.brand.toLowerCase() === 'visa' && (
                                    <Image className='ml-3' src="/payment/visaIcon.png" alt="VISA" width={60} height={40} />
                                  )}
                                  {method.is_default && (
                                    <span className="ml-2 text-xs text-green-400">(Default)</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </>
                        )}

                        {/* Wallet selection row — always available if wallet can be shown */}
                        {walletClientSecret && walletLabel && (
                          <div
                            className="relative p-4 cursor-pointer flex items-center"
                            style={{
                              background: selectedPaymentMethod === WALLET_METHOD_ID ? 'rgba(136,104,255,0.2)' : 'rgba(136,104,255,0.1)',
                              borderRadius: '10px',
                              border: selectedPaymentMethod === WALLET_METHOD_ID ? '2px solid #8868FF' : '1px solid #8868FF'
                            }}
                            onClick={() => setSelectedPaymentMethod(WALLET_METHOD_ID)}
                          >
                            <div className="w-5 h-5 flex items-center justify-center" style={{ background: selectedPaymentMethod === WALLET_METHOD_ID ? '#8868FF' : 'transparent', borderRadius: '50%', border: '2px solid #8868FF' }} />
                            <Image className='ml-3' src={walletLabel === 'Apple Pay' ? '/payment/apple.png' : '/payment/google.png'} alt={walletLabel} width={24} height={24} />
                            <span className="text-white text-sm font-medium ml-2">{walletLabel}</span>
                          </div>
                        )}

                        {/* Render wallet element when selected */}
                        {selectedPaymentMethod === WALLET_METHOD_ID && walletClientSecret && (
                          <Elements stripe={stripePromise} options={{
                            clientSecret: walletClientSecret,
                            appearance: { theme: 'night' }
                          }}>
                            <PaymentElement
                              options={{
                                layout: { type: 'accordion', defaultCollapsed: false, radios: false, spacedAccordionItems: false },
                                wallets: {
                                  applePay: walletLabel === 'Apple Pay' ? 'auto' : 'never',
                                  googlePay: walletLabel === 'Google Pay' ? 'auto' : 'never'
                                },
                                paymentMethodOrder: walletLabel === 'Apple Pay' ? ['apple_pay'] : ['google_pay']
                              }}
                            />
                            <WalletConfirmButton
                              onError={(msg) => setError(msg)}
                              onSuccess={(piId) => {
                                setError(null)
                                setProcessingStep('success')
                                toastSuccess('Payment successful!')
                                setTimeout(() => { onSuccess(); onClose() }, 1500)
                              }}
                            />
                            <button
                              className="mt-2 w-full py-2 rounded bg-[#666] text-white"
                              onClick={() => setSelectedPaymentMethod('')}
                            >
                              Back to payment methods
                            </button>
                          </Elements>
                        )}

                        {/* Saved-cards empty state - only show when no cards AND no wallet available */}
                        {paymentMethods.length === 0 && !(walletClientSecret && walletLabel) && (
                          <div className="text-gray-400 text-sm">No payment methods</div>
                        )}

                        {/* Pay button for card payments */}
                        {selectedPaymentMethod && selectedPaymentMethod !== WALLET_METHOD_ID && (
                          <button
                            className="w-full p-4 bg-[#8868FF] text-white rounded-lg font-medium hover:bg-[#7759FF] transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                            onClick={handlePayment}
                            disabled={isLoading || processingStep !== 'idle'}
                          >
                            {processingStep === 'creating' ? 'Creating Payment...' : 
                             processingStep === 'confirming' ? 'Confirming Payment...' :
                             isLoading ? 'Processing...' : 
                             `Pay $${paymentAmount.toFixed(2)}`}
                          </button>
                        )}

                        {/* Add payment method button */}
                        <button
                          className="w-full p-4 border-2 border-dashed border-gray-500 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors flex items-center justify-center"
                          onClick={handleAddPaymentMethod}
                        >
                          <span className="text-2xl mr-2">+</span>
                          {paymentMethods.length > 0 ? 'Add new payment method' : 'Add payment method'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {showCreditCardModal && (
        <CreditCardModal 
          isOpen={showCreditCardModal} 
          onClose={handleCreditCardModalClose} 
          onSuccess={handleCreditCardModalClose}
          mode="add-payment-method"
        />
      )}
    </>
  )
}
