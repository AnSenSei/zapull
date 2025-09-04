'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getCurrentUserId } from '@/lib/authUtils'
import { getStripe } from '@/lib/stripeIntegration'
import paymentApi from '@/lib/paymentApi'

// Initialize Stripe
const stripePromise = getStripe()

interface PaymentFormProps {
  clientSecret: string
  listingId: string
  offerId?: string
}

function PaymentForm({ clientSecret, listingId, offerId }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      setError('Stripe not loaded properly')
      return
    }

    // PaymentElement will be automatically retrieved by Stripe

    setLoading(true)
    setError(null)

    try {
      // Confirm the payment using PaymentElement
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success?listing_id=${listingId}${offerId ? `&offer_id=${offerId}` : ''}`,
        },
        redirect: 'if_required' // Don't redirect for successful payments
      })

      if (result.error) {
        setError(result.error.message || 'Payment failed')
      } else if (result.paymentIntent) {
        // Payment successful
        setPaymentSuccess(true)
        
        // Wait a bit to show success message
        setTimeout(() => {
          router.push('/listed')
        }, 2000)
      }
    } catch (err) {
      console.error('Payment error:', err)
      setError('Payment failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-[#0F111C] flex items-center justify-center">
        <div className="bg-[#1F2235] p-8 rounded-lg max-w-md w-full text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
          <p className="text-gray-300">Your payment has been processed successfully.</p>
          <p className="text-gray-400 text-sm mt-4">Redirecting to your listings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0F111C] flex items-center justify-center p-4">
      <div className="bg-[#1F2235] p-8 rounded-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-white mb-6">Complete Payment</h1>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Card Details
            </label>
            <PaymentElement
              options={{
                layout: 'tabs',
                paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
                walletReturnUrl: `${window.location.origin}/payment-success`
              }}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!stripe || loading}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              loading || !stripe
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED]'
            }`}
          >
            {loading ? 'Processing...' : 'Pay Now'}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="w-full mt-2 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  )
}

function PaymentPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const clientSecret = searchParams.get('client_secret')
  const listingId = searchParams.get('listing_id')
  const offerId = searchParams.get('offer_id')

  useEffect(() => {
    if (!clientSecret || !listingId) {
      setError('Invalid payment parameters')
      setLoading(false)
      return
    }

    // Validate the user is logged in
    const userId = getCurrentUserId()
    if (!userId) {
      router.push('/auth/login')
      return
    }

    setLoading(false)
  }, [clientSecret, listingId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F111C] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B5CF6]"></div>
      </div>
    )
  }

  if (error || !clientSecret || !listingId) {
    return (
      <div className="min-h-screen bg-[#0F111C] flex items-center justify-center">
        <div className="bg-[#1F2235] p-8 rounded-lg max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-white mb-4">Error</h2>
          <p className="text-gray-300 mb-4">{error || 'Invalid payment parameters'}</p>
          <button
            onClick={() => router.push('/listed')}
            className="px-6 py-2 bg-[#8B5CF6] text-white rounded-lg hover:bg-[#7C3AED] transition-colors"
          >
            Return to Listings
          </button>
        </div>
      </div>
    )
  }

  return (
    <Elements 
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#8B5CF6',
            colorBackground: '#2A2B3D',
            colorText: '#ffffff',
            colorDanger: '#ef4444',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            spacingUnit: '4px',
            borderRadius: '8px'
          }
        }
      }}
    >
      <PaymentForm clientSecret={clientSecret} listingId={listingId} offerId={offerId || undefined} />
    </Elements>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F111C] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B5CF6]"></div>
      </div>
    }>
      <PaymentPageContent />
    </Suspense>
  )
}