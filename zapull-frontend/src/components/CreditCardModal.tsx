'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getCurrentUserId } from '@/lib/authUtils'
import { getStripe } from '@/lib/stripeIntegration'

// Initialize Stripe
const stripePromise = getStripe()

interface CreditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amount?: number;
  points?: number;
  bonus?: number;
  referCode?: string;
  mode?: 'payment' | 'add-payment-method';
}

export interface CreditCardFormData {
  cardName: string;
  country: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipcode: string;
}

// Helper function to convert country names to country codes
function getCountryCode(countryName: string): string {
  const countryMap: { [key: string]: string } = {
    'United States': 'US',
    'Canada': 'CA',
    'United Kingdom': 'GB',
    'Mexico': 'MX',
    'Germany': 'DE',
    'France': 'FR',
    'Australia': 'AU',
    'Italy': 'IT'
  };
  return countryMap[countryName] || 'US';
}

// Internal payment form component using Stripe Elements
function CheckoutForm({ 
  amount, 
  points, 
  bonus, 
  referCode, 
  onSuccess, 
  onClose,
  formData,
  setFormData,
  handleInputChange,
  mode = 'payment',
  clientSecret
}: {
  amount: number;
  points: number;
  bonus: number;
  referCode?: string;
  onSuccess: () => void;
  onClose: () => void;
  formData: CreditCardFormData;
  setFormData: React.Dispatch<React.SetStateAction<CreditCardFormData>>;
  handleInputChange: (field: keyof CreditCardFormData, value: string | boolean) => void;
  mode?: 'payment' | 'add-payment-method';
  clientSecret?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const userId = getCurrentUserId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  // Payment status polling function
  const pollPaymentStatus = async (paymentIntentId: string) => {
    const maxAttempts = 30; // Maximum 30 polling attempts (about 5 minutes)
    let attempts = 0;
    
    const poll = async () => {
      try {
        attempts++;
        
        // Call backend API to check payment status
        const { paymentApi } = await import('@/lib/paymentApi');
        const data = await paymentApi.checkPaymentStatus(paymentIntentId);
        
        const { status } = data;
        setPaymentStatus(status);
        
        switch (status) {
          case 'succeeded':
            setError(null);
            console.log('Payment successful:', paymentIntentId);
            
            // The payment is already succeeded on Stripe's side
            // The backend webhook will handle updating the user's balance
            // We can optionally check the payment status from backend
            try {
              console.log('Payment succeeded, webhook will handle balance update');
              // Note: The backend webhook handles the actual balance update
              // This is just for UI feedback
            } catch (completeError) {
              console.warn('Polling - Failed to call payment completion API:', completeError);
            }
            
            onSuccess();
            onClose();
            return;
            
          case 'canceled':
          case 'requires_payment_method':
            setError('Payment failed, please try again');
            return;
            
          case 'processing':
            if (attempts >= maxAttempts) {
              setError('Payment processing timeout, please contact customer service to confirm payment status');
              return;
            }
            // Continue polling
            setTimeout(poll, 10000); // Check again after 10 seconds
            break;
            
          default:
            if (attempts >= maxAttempts) {
              setError(`Abnormal payment status: ${status}, please contact customer service`);
              return;
            }
            setTimeout(poll, 10000);
        }
      } catch (error: any) {
        console.error('Failed to poll payment status:', error);
        if (attempts >= maxAttempts) {
          setError('Unable to confirm payment status, please contact customer service');
        } else {
          setTimeout(poll, 10000);
        }
      }
    };
    
    // Start polling
    setTimeout(poll, 5000); // Start first check after 5 seconds
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      setError('Stripe not loaded properly');
      return;
    }

    if (!userId) {
      setError('Please log in first');
      return;
    }

    // PaymentElement will be automatically retrieved by Stripe

    // PaymentElement handles its own validation

    setLoading(true);
    setError(null);

    try {
      if (mode === 'add-payment-method') {
        // Add payment method mode using Setup Intent
        // PaymentElement will handle the payment method creation
        const result = await stripe.confirmSetup({
          elements,
          confirmParams: {
            return_url: window.location.origin + '/payment-success',
          },
          redirect: 'if_required'
        });

        if (result.error) {
          throw new Error(result.error.message || 'Failed to add payment method');
        }

        console.log('Payment method added successfully');
        onSuccess();
        onClose();
      } else {
        // Payment mode using PaymentElement
        // With PaymentElement, we confirm the payment directly
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: window.location.origin + '/payment-success',
            payment_method_data: {
              billing_details: {
                name: formData.cardName,
                address: {
                  line1: formData.addressLine1,
                  line2: formData.addressLine2 || undefined,
                  city: formData.city,
                  state: formData.state,
                  postal_code: formData.zipcode,
                  country: getCountryCode(formData.country),
                },
              },
            },
          },
          redirect: 'if_required' // Don't redirect for successful payments
        });

         if (result.error) {
           // Payment failure handling
           console.error('Payment confirmation failed:', result.error);
           throw new Error(result.error.message || 'Payment confirmation failed');
         }

         // Check payment status
         if (result.paymentIntent) {
           const { status } = result.paymentIntent;
           
           switch (status) {
             case 'succeeded':
               // Payment successful
               console.log('Payment successful:', result.paymentIntent.id);
               
               try {
                 // Call backend API to confirm payment status and update records
                 const { paymentApi } = await import('@/lib/paymentApi');
                  const statusData = await paymentApi.checkPaymentStatus(result.paymentIntent.id);
                  
                  if (statusData.status === 'succeeded') {
                    console.log('Backend payment status confirmed successfully:', statusData);
                    
                    // The payment is already succeeded on Stripe's side
                    // The backend webhook will handle updating the user's balance
                    // We can optionally check the payment status from backend
                    try {
                      console.log('Payment succeeded, webhook will handle balance update');
                        
                        // Refresh user info to update points with retry mechanism
                        const refreshUserInfo = async (retries = 3, delay = 2000) => {
                          for (let i = 0; i < retries; i++) {
                            try {
                              // Wait a bit for webhook to process
                              if (i > 0) {
                                await new Promise(resolve => setTimeout(resolve, delay));
                              }
                              
                              const { userApi } = await import('@/lib/userApi');
                              const { useAuthStore } = await import('@/store/authStore');
                              const updatedUserInfo = await userApi.getUserInfo();
                              
                              // Check if points were updated
                              const currentUserInfo = useAuthStore.getState().userInfo;
                              if (currentUserInfo && updatedUserInfo.pointsBalance > currentUserInfo.pointsBalance) {
                                useAuthStore.getState().setUserInfo(updatedUserInfo);
                                console.log('User info refreshed with new points:', updatedUserInfo);
                                return true;
                              } else if (i === retries - 1) {
                                // Last attempt, update anyway
                                useAuthStore.getState().setUserInfo(updatedUserInfo);
                                console.log('User info refreshed (final attempt):', updatedUserInfo);
                                return false;
                              }
                              
                              console.log(`Attempt ${i + 1}: Points not updated yet, retrying...`);
                            } catch (refreshError) {
                              console.warn(`Failed to refresh user info (attempt ${i + 1}):`, refreshError);
                              if (i === retries - 1) {
                                // Don't block payment flow
                                return false;
                              }
                            }
                          }
                          return false;
                        };
                        
                        // Start refresh with delay
                        setTimeout(async () => {
                          const pointsUpdated = await refreshUserInfo();
                          if (!pointsUpdated) {
                            console.warn('Points may not be updated yet. They will appear shortly.');
                          }
                        }, 1000); // Initial 1 second delay
                    } catch (completeError) {
                      console.warn('Failed to call payment completion API:', completeError);
                      // Don't block payment flow
                    }
                    
                    // PaymentElement handles payment method saving automatically
                    
                    // Call success callback
                    onSuccess();
                    // Clear state
                    setPaymentStatus(null);
                    setError(null);
                    setLoading(false);
                    onClose();
                 } else {
                   throw new Error('Backend payment status verification failed');
                 }
               } catch (statusError: any) {
                 console.error('Failed to verify payment status:', statusError);
                 setError('Payment successful but status verification failed, please contact customer service to confirm');
               }
               break;
               
             case 'processing':
                setPaymentStatus('processing');
                setError('Payment is processing, please wait...');
                // Start payment status polling
                pollPaymentStatus(result.paymentIntent.id);
                break;
               
             case 'requires_payment_method':
               setError('Invalid payment method, please re-enter card information');
               break;
               
             case 'requires_confirmation':
               setError('Payment requires further confirmation');
               break;
               
             case 'requires_action':
               setError('Payment requires additional verification (e.g., 3D Secure)');
               break;
               
             case 'canceled':
               setError('Payment cancelled');
               break;
               
             case 'requires_capture':
               // For payments that need manual capture
               setError('Payment authorized, waiting for processing');
               break;
               
             default:
               setError(`Unknown payment status: ${status}`);
           }
         } else {
           throw new Error('Abnormal payment result');
         }
       }
       
     } catch (error: any) {
       console.error(mode === 'add-payment-method' ? 'Failed to add payment method:' : 'Payment failed:', error);
       setError(error.message || (mode === 'add-payment-method' ? 'Failed to add payment method, please try again' : 'Payment failed, please try again'));
     } finally {
       setLoading(false);
     }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {/* Error message */}
      {error && (
        <div className="mb-4 text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-800">
          {error}
        </div>
      )}
      
      {/* Payment status indicator */}
      {paymentStatus && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
          <div className="flex items-center space-x-2">
            {paymentStatus === 'processing' && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
            )}
            <p className="text-blue-400 text-sm">
              {paymentStatus === 'processing' && 'Payment processing, please wait...'}
              {paymentStatus === 'succeeded' && 'Payment successful!'}
              {paymentStatus === 'requires_action' && 'Requires additional verification'}
              {paymentStatus === 'requires_confirmation' && 'Requires payment confirmation'}
            </p>
          </div>
        </div>
      )}
      
      {/* Cardholder name */}
      <div>
        <input
          type="text"
          placeholder="Name on card"
          value={formData.cardName}
          onChange={(e) => handleInputChange('cardName', e.target.value)}
          className="w-full p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          required
        />
      </div>


      {/* Payment Element - configured: wallets disabled in add-payment-method mode */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Payment Method</label>
        <PaymentElement
          options={{
            layout: 'accordion',
            paymentMethodOrder: mode === 'add-payment-method' ? ['card'] : ['apple_pay', 'google_pay', 'card'],
            wallets: {
              applePay: mode === 'add-payment-method' ? 'never' : 'auto',
              googlePay: mode === 'add-payment-method' ? 'never' : 'auto'
            }
          }}
        />
      </div>

      {/* Address line 1 */}
      <div>
        <input
          type="text"
          placeholder="Address"
          value={formData.addressLine1}
          onChange={(e) => handleInputChange('addressLine1', e.target.value)}
          className="w-full p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          required
        />
      </div>

      {/* Address line 2 (optional) */}
      <div>
        <input
          type="text"
          placeholder="Apartment, suite, etc. (optional)"
          value={formData.addressLine2 || ''}
          onChange={(e) => handleInputChange('addressLine2', e.target.value)}
          className="w-full p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* City and State */}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="City"
          value={formData.city}
          onChange={(e) => handleInputChange('city', e.target.value)}
          className="p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          required
        />
        <input
          type="text"
          placeholder="State / Province"
          value={formData.state}
          onChange={(e) => handleInputChange('state', e.target.value)}
          className="p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          required
        />
      </div>

      {/* Country and Zip code */}
      <div className="grid grid-cols-2 gap-3">
        <select
          value={formData.country}
          onChange={(e) => handleInputChange('country', e.target.value)}
          className="p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: 'right 0.5rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.5em 1.5em'
          }}
        >
          <option value="United States">United States</option>
          <option value="Canada">Canada</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="Mexico">Mexico</option>
          <option value="Germany">Germany</option>
          <option value="France">France</option>
          <option value="Australia">Australia</option>
          <option value="Italy">Italy</option>
        </select>
        <input
          type="text"
          placeholder="Zip / Postal code"
          value={formData.zipcode}
          onChange={(e) => handleInputChange('zipcode', e.target.value)}
          className="p-3 bg-[#2A2B3D] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          required
        />
      </div>



      {/* Payment button */}
      <button
        type="submit"
        disabled={loading || !stripe || paymentStatus === 'processing'}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
      >
        {loading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>{mode === 'add-payment-method' ? 'Adding...' : 'Processing...'}</span>
          </div>
        ) : paymentStatus === 'processing' ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Payment Processing...</span>
          </div>
        ) : (
          mode === 'add-payment-method' ? 'Add Payment Method' : `Pay $${amount.toFixed(2)}`
        )}
      </button>
    </form>
  );
}

export default function CreditCardModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  amount = 499.98,
  points = 55000,
  bonus = 5000,
  referCode,
  mode = 'payment'
}: CreditCardModalProps) {
  const userId = getCurrentUserId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreditCardFormData>({
    cardName: '',
    country: 'United States',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipcode: ''
  });

  const handleInputChange = (field: keyof CreditCardFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Create payment intent or setup intent when modal opens
  useEffect(() => {
    if (!isOpen || !userId) return;

    const createIntent = async () => {
      setLoading(true);
      setError(null);
      try {
        const { paymentApi } = await import('@/lib/paymentApi');
        
        if (mode === 'add-payment-method') {
          // Create setup intent for adding payment method
          const setupIntent = await paymentApi.createSetupIntent();
          setClientSecret(setupIntent.client_secret);
        } else {
          // Create payment intent for payment
          const paymentIntent = await paymentApi.createPaymentIntent({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            refer_code: referCode
          });
          setClientSecret(paymentIntent.client_secret);
        }
      } catch (err: any) {
        console.error('Failed to create intent:', err);
        setError(err.message || 'Failed to initialize payment');
      } finally {
        setLoading(false);
      }
    };

    createIntent();
  }, [isOpen, userId, mode, amount, referCode]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setError(null);
      setFormData({
        cardName: '',
        country: 'United States',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        zipcode: ''
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        className="relative w-full h-[85vh] sm:h-auto sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-[20px]"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          border: '2px solid #8B5CF6'
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title and close button */}
        <div className="sticky top-0 z-20 p-6 text-center border-b border-gray-700 bg-[#0F111C]/95 backdrop-blur">
          <h2 className="text-xl font-bold text-white tracking-wider">
            {mode === 'add-payment-method' ? 'ADD PAYMENT METHOD' : 'CREDIT CARD CHECKOUT'}
          </h2>
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 text-white hover:text-gray-300 transition-colors"
            disabled={loading}
            aria-label="Close"
          >
            <Image src="/icons/close.png" alt="Close" width={24} height={24} />
          </button>
        </div>
        
        <div className="p-6">
          {/* Credit Card title */}
          <div className="text-center mb-6">
            <h3 className="text-white font-medium mb-4">Credit Card</h3>
          </div>
          
          {/* Wrap payment form with Stripe Elements */}
          {clientSecret ? (
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
                    borderRadius: '8px',
                    colorTextPlaceholder: '#9ca3af'
                  },
                  rules: {
                    '.Tab': {
                      border: '1px solid #4b5563',
                      backgroundColor: '#1F2235',
                    },
                    '.Tab--selected': {
                      backgroundColor: '#2A2B3D',
                      borderColor: '#8B5CF6'
                    },
                    '.Input': {
                      backgroundColor: '#2A2B3D',
                      border: '1px solid #4b5563'
                    },
                    '.Input:focus': {
                      borderColor: '#8B5CF6',
                      boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.2)'
                    }
                  }
                }
              }}
            >
              <CheckoutForm
                amount={amount}
                points={points}
                bonus={bonus}
                referCode={referCode}
                onSuccess={onSuccess}
                onClose={onClose}
                formData={formData}
                setFormData={setFormData}
                handleInputChange={handleInputChange}
                mode={mode}
                clientSecret={clientSecret}
              />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-8">
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-white">Initializing payment...</span>
                </div>
              ) : error ? (
                <div className="text-red-400">{error}</div>
              ) : null}
            </div>
          )}
          
          {/* Total amount display - only show in payment mode */}
          {mode === 'payment' && (
            <div className="bg-[#2A2B3D] rounded-lg p-4 mt-6">
              <div className="text-sm text-gray-400 mb-1">Total Amount</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-black">$</span>
                  </div>
                  <span className="text-white font-medium">{points.toLocaleString()}</span>
                  {bonus > 0 && (
                    <span className="text-yellow-500 text-sm">+{bonus.toLocaleString()} BONUS</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}