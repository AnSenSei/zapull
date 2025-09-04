'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import paymentApi from '@/lib/paymentApi'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const checkPaymentStatus = async () => {
      // Get payment intent from URL params (Stripe adds this automatically)
      const paymentIntent = searchParams.get('payment_intent')
      const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret')
      const setupIntent = searchParams.get('setup_intent')
      const setupIntentClientSecret = searchParams.get('setup_intent_client_secret')
      
      // Get our custom params
      const listingId = searchParams.get('listing_id')
      const offerId = searchParams.get('offer_id')
      const redirectStatus = searchParams.get('redirect_status')

      if (redirectStatus === 'succeeded') {
        setStatus('success')
        if (paymentIntent) {
          setMessage('Payment successful! Your transaction has been completed.')
        } else if (setupIntent) {
          setMessage('Payment method added successfully!')
        }
        
        // Redirect after showing success message
        setTimeout(() => {
          if (listingId) {
            router.push('/listed')
          } else {
            router.push('/user')
          }
        }, 3000)
      } else if (redirectStatus === 'processing') {
        setStatus('loading')
        setMessage('Your payment is being processed. This may take a few moments.')
        
        // For processing payments, we should poll the status
        if (paymentIntent) {
          try {
            const statusData = await paymentApi.checkPaymentStatus(paymentIntent)
            if (statusData.status === 'succeeded') {
              setStatus('success')
              setMessage('Payment successful! Your transaction has been completed.')
              setTimeout(() => {
                router.push(listingId ? '/listed' : '/user')
              }, 3000)
            }
          } catch (error) {
            console.error('Error checking payment status:', error)
          }
        }
      } else {
        setStatus('error')
        setMessage('Payment was not completed. Please try again.')
        setTimeout(() => {
          router.back()
        }, 3000)
      }
    }

    checkPaymentStatus()
  }, [searchParams, router])

  return (
    <div className="min-h-screen bg-[#0F111C] flex items-center justify-center p-4">
      <div className="bg-[#1F2235] p-8 rounded-lg max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#8B5CF6] mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-white mb-2">Processing...</h2>
            <p className="text-gray-300">{message || 'Please wait while we process your payment.'}</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-white mb-2">Success!</h2>
            <p className="text-gray-300">{message}</p>
            <p className="text-gray-400 text-sm mt-4">Redirecting...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="text-red-500 text-6xl mb-4">✗</div>
            <h2 className="text-2xl font-bold text-white mb-2">Payment Failed</h2>
            <p className="text-gray-300">{message}</p>
            <p className="text-gray-400 text-sm mt-4">Redirecting back...</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F111C] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B5CF6]"></div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  )
}