'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { processRechargePayment, getUserRechargeHistory, formatAmount, getUserPaymentMethods } from '@/lib/stripeIntegration'
import { getCurrentUserId } from '@/lib/authUtils'
import { PaymentMethod } from '@/lib/paymentApi'
import CreditCardModal from './CreditCardModal'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { paymentApi } from '@/lib/paymentApi'
import { getStripe } from '@/lib/stripeIntegration'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

interface MobilePointsTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PackageOption {
  id: number;
  points: number;
  price: number;
  image: string;
  bonus?: number;
}

function WalletConfirmButton({ onError, onSuccess, price }: { onError: (msg: string) => void; onSuccess: (paymentIntentId?: string) => void; price?: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.origin + '/payment-success' : undefined,
        },
        redirect: 'if_required'
      });
      if (result.error) {
        onError(result.error.message || 'Payment failed');
      } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        if (onSuccess) onSuccess(result.paymentIntent.id);
      }
    } catch (e: any) {
      onError(e.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button 
      className="w-full px-4 py-3 rounded-lg text-white font-medium text-sm disabled:bg-gray-600" 
      style={{
        background: !submitting && stripe && elements ? '#8868FF' : '#666',
        borderRadius: '8px'
      }}
      disabled={!stripe || !elements || submitting} 
      onClick={submit}
    >
      {submitting ? 'Processing...' : price ? `Buy for $${price.toFixed(2)}` : 'Pay with Wallet'}
    </button>
  );
}

export default function MobilePointsTopUpModal({ isOpen, onClose, onSuccess }: MobilePointsTopUpModalProps) {
  // Get current user ID from auth state
  const userId = getCurrentUserId();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(2);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const WALLET_METHOD_ID = 'WALLET';
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [affiliateCode, setAffiliateCode] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [currentStep, setCurrentStep] = useState<'packages' | 'review' | 'payment'>('packages');
  const [affiliateMessage, setAffiliateMessage] = useState<string | null>(null);
  const [affiliateError, setAffiliateError] = useState<string | null>(null);
  const [affiliateApplied, setAffiliateApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wallets (PaymentElement) for mobile
  const [walletClientSecret, setWalletClientSecret] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<'Apple Pay' | 'Google Pay' | null>(null);
  const stripePromise = getStripe();
  
  // Recharge package options
  const packages: PackageOption[] = [
    { id: 1, points: 1000, price: 10, image: '/payment/coin-1.png' },
    { id: 2, points: 2500, price: 25, image: '/payment/coin-2.png' },
    { id: 3, points: 5000, price: 50, image: '/payment/coin-3.png' },
    { id: 4, points: 10000, price: 100, image: '/payment/coin-4.png', bonus: 0.05 },
    { id: 5, points: 25000, price: 250, image: '/payment/coin-5.png', bonus: 0.075 },
    { id: 6, points: 50000, price: 500, image: '/payment/coin-6.png', bonus: 0.10 },
  ];

  // Get payment methods list
  const loadPaymentMethods = async () => {
    if (!userId) return;
    
    try {
      setLoadingPaymentMethods(true);
      const response = await getUserPaymentMethods();
      setPaymentMethods(response.payment_methods);
      
      // If there's a default payment method, auto-select it
      if (response.default_payment_method_id) {
        setSelectedPaymentMethod(response.default_payment_method_id);
      } else if (response.payment_methods.length > 0) {
        setSelectedPaymentMethod(response.payment_methods[0].id);
      }
    } catch (error) {
      console.error('Failed to get payment methods:', error);
      setError('Failed to get payment methods');
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  // Handle package selection
  const handlePackageSelect = (id: number) => {
    setSelectedPackage(id);
  };

  // Derived totals for display
  const selectedPackageDetails = selectedPackage ? packages.find(p => p.id === selectedPackage) : null;
  const totalPointsWithBonuses = selectedPackageDetails
    ? Math.floor(selectedPackageDetails.points * (1 + (selectedPackageDetails.bonus || 0)) * (affiliateApplied ? 1.05 : 1))
    : null;

  // Handle payment method selection
  const handlePaymentMethodSelect = (paymentMethodId: string) => {
    setSelectedPaymentMethod(paymentMethodId);
  };

  // Handle add payment method
  const handleAddPaymentMethod = () => {
    setShowCreditCardModal(true);
  };

  // Handle affiliate code apply
  const handleApplyAffiliateCode = async () => {
    if (!affiliateCode.trim()) {
      setAffiliateError('Please enter an affiliate code');
      setAffiliateMessage(null);
      return;
    }

    try {
      const { userApi } = await import('@/lib/userApi');
      
      // First check if user has already been referred
      const referStatus = await userApi.checkRefer();
      if (referStatus.is_referred) {
        setAffiliateError('This account has already been referred');
        setAffiliateMessage(null);
        setAffiliateApplied(false);
        return;
      }
      
      // Validate the referral code
      const validation = await userApi.validateReferralCode(affiliateCode);
      
      if (!validation.is_valid) {
        setAffiliateError(validation.error || 'Invalid referral code');
        setAffiliateMessage(null);
        setAffiliateApplied(false);
      } else {
        setAffiliateMessage(`Applied successfully! Referral from ${validation.owner_name}`);
        setAffiliateError(null);
        setAffiliateApplied(true);
      }
    } catch (error) {
      console.error('Failed to validate referral code:', error);
      setAffiliateError('Failed to apply affiliate code. Please try again.');
      setAffiliateMessage(null);
      setAffiliateApplied(false);
    }
  };

  // Create a PaymentIntent for wallets when package changes
  useEffect(() => {
    const createWalletPI = async () => {
      try {
        if (!isOpen || !userId || selectedPackage === null) return;
        const pkg = packages.find(p => p.id === selectedPackage);
        if (!pkg) return;
        const pi = await paymentApi.createPaymentIntent({
          amount: Math.round(pkg.price * 100),
          currency: 'usd',
          refer_code: affiliateCode || undefined,
        });
        setWalletClientSecret(pi.client_secret);
        // Decide label based on environment
        let label: 'Apple Pay' | 'Google Pay' | null = null;
        try {
          // Apple Pay detection
          // @ts-ignore
          if (typeof window !== 'undefined' && (window as any).ApplePaySession && (window as any).ApplePaySession.canMakePayments()) {
            label = 'Apple Pay';
          }
        } catch {}
        if (!label) {
          // Fallback to Google Pay
          label = 'Google Pay';
        }
        setWalletLabel(label);
      } catch (e) {
        console.error('Failed to create PaymentIntent for wallets:', e);
        setWalletClientSecret(null);
        setWalletLabel(null);
      }
    };
    createWalletPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId, selectedPackage, affiliateCode]);

  // Handle buy button click
  const handleBuy = async () => {
    
    if (!userId) {
      setError('User not logged in, please log in first');
      return;
    }
    
    if (selectedPackage === null) {
      setError('Please select a recharge package');
      return;
    }

    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    // Wallet path: confirm via PaymentElement on confirm
    if (selectedPaymentMethod === WALLET_METHOD_ID) {
      try {
        setIsLoading(true);
        const stripe = await getStripe();
        if (!stripe || !walletClientSecret) throw new Error('Wallet not initialized');
        // Retrieve Elements by creating a temporary Elements context for confirm
        const result = await stripe.confirmPayment({
          clientSecret: walletClientSecret,
          confirmParams: { return_url: typeof window !== 'undefined' ? window.location.origin + '/payment-success' : undefined },
          redirect: 'if_required'
        } as any);
        if ((result as any)?.error) {
          throw new Error((result as any).error.message || 'Wallet payment failed');
        }
        const piId = (result as any)?.paymentIntent?.id;
        if (piId) {
          await handlePaymentSuccess(piId);
        } else {
          onClose();
          if (onSuccess) onSuccess();
        }
      } catch (e: any) {
        toast.error(e.message || 'Wallet payment failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
    if (!selectedPkg) {
      setError('Invalid package selected');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      
      const paymentIntent = await processRechargePayment({
        amount: selectedPkg.price,
        referCode: affiliateCode || undefined,
        payment_method_id: selectedPaymentMethod
      });

      if (!paymentIntent) {
        throw new Error('Failed to create payment intent');
      }

      // Initialize Stripe
      const stripeInstance = await getStripe();
      
      if (!stripeInstance) {
        throw new Error('Failed to initialize Stripe');
      }

      // Handle different payment intent statuses
      if (paymentIntent.status === 'requires_payment_method') {
        // Need to attach payment method and confirm
        const { error: confirmError, paymentIntent: confirmedPayment } = await stripeInstance.confirmCardPayment(
          paymentIntent.client_secret,
          {
            payment_method: selectedPaymentMethod
          }
        );
        
        if (confirmError) {
          setError(confirmError.message || 'Payment confirmation failed');
        } else if (confirmedPayment && confirmedPayment.status === 'succeeded') {
          // Payment successful
          await handlePaymentSuccess(confirmedPayment.id);
        } else {
          setError('Payment failed with status: ' + (confirmedPayment?.status || 'unknown'));
        }
      } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
        // Handle 3D Secure authentication
        const { error: confirmError, paymentIntent: confirmedPayment } = await stripeInstance.confirmCardPayment(
          paymentIntent.client_secret
        );
        
        if (confirmError) {
          setError(confirmError.message || 'Payment confirmation failed');
        } else if (confirmedPayment && confirmedPayment.status === 'succeeded') {
          // Payment successful
          await handlePaymentSuccess(confirmedPayment.id);
        } else {
          setError('Payment failed with status: ' + (confirmedPayment?.status || 'unknown'));
        }
      } else if (paymentIntent.status === 'succeeded') {
        // Payment successful without confirmation needed
        await handlePaymentSuccess(paymentIntent.id);
      } else {
        setError('Payment failed with status: ' + paymentIntent.status);
      }
    } catch (error) {
      console.error('Payment error:', error);
      setError('Payment processing failed, please try again');
    } finally {
      setIsLoading(false);
    }
  };
  // Handle payment success
  const handlePaymentSuccess = async (paymentIntentId: string) => {
    try {
      // Check payment status
      const { paymentApi } = await import('@/lib/paymentApi');
      const statusData = await paymentApi.checkPaymentStatus(paymentIntentId);
      
      if (statusData.status === 'succeeded') {
        // Show success message first
        const pkg = packages.find(p => p.id === selectedPackage);
        if (pkg) {
          const totalPoints = Math.floor(pkg.points * (1 + (pkg.bonus || 0)) * (affiliateApplied ? 1.05 : 1));
          toastSuccess(`Recharge successful! Got ${totalPoints.toLocaleString()} points`);
        }
        
        // Add a small delay to ensure the backend has processed the payment
        setTimeout(async () => {
          try {
            // Refresh user info
            const { userApi } = await import('@/lib/userApi');
            const { useAuthStore } = await import('@/store/authStore');
            
            const userInfo = await userApi.getUserInfo();
            useAuthStore.getState().setUserInfo(userInfo);
            console.log('User info refreshed successfully:', userInfo);
            
            // Call onSuccess callback if provided
            if (onSuccess) {
              onSuccess();
            }
          } catch (error) {
            console.error('Failed to refresh user info:', error);
          }
        }, 1000); // Wait 1 second before refreshing
        
        onClose();
      } else {
        setError('Abnormal payment status, please contact customer service');
      }
    } catch (error) {
      console.error('Failed to check payment status:', error);
      setError('Failed to check payment status, please contact customer service');
    }
  };

  const handleCreditCardSuccess = async () => {
    // Refresh payment methods list (whether payment successful or payment method added successfully)
    await loadPaymentMethods();
    setShowCreditCardModal(false);
  };

  // Load payment methods list
  useEffect(() => {
    if (isOpen && userId) {
      loadPaymentMethods();
    }
  }, [isOpen, userId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedPackage(2);
      setSelectedPaymentMethod('');
      setPaymentMethods([]);
      setCurrentStep('packages');
      setAffiliateCode('');
      setGiftCode('');
      setAffiliateMessage(null);
      setAffiliateError(null);
      setAffiliateApplied(false);
      setError(null);
    }
  }, [isOpen]);


  // Early return if modal is not open
  if (!isOpen) return null;

  // Use previously computed selectedPackageDetails above

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[100] flex items-center justify-center">
      <motion.div 
          className="relative w-full h-full sm:w-full sm:max-w-md sm:h-auto sm:max-h-[95vh] flex flex-col z-[101]"
          style={{
            background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
            borderRadius: '0px',
            border: '2px solid #8B5CF6'
          }}
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-purple-500/20 flex-shrink-0">
          <h2 className="text-white text-lg font-bold">POINTS TOP-UP</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 transition-colors bg-black bg-opacity-50 rounded-full p-1"
          >
            <Image src="/icons/close.png" alt="Close" width={16} height={16} />
          </button>
        </div>
        
        {/* Content container - use explicit height calculation for mobile */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ 
          WebkitOverflowScrolling: 'touch',
          maxHeight: 'calc(100vh - 60px)',
          touchAction: 'pan-y'
        }}>
          {/* Step Navigation */}
          <div className="flex border-b border-purple-500/20">
            <button 
              className={`flex-1 py-2 px-3 text-xs font-medium transition-colors ${
                currentStep === 'packages' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'
              }`}
              onClick={() => setCurrentStep('packages')}
            >
              Select Package
            </button>
            <button 
              className={`flex-1 py-2 px-3 text-xs font-medium transition-colors ${
                currentStep === 'review' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'
              }`}
              onClick={() => setCurrentStep('review')}
            >
              Review Order
            </button>
            <button 
              className={`flex-1 py-2 px-3 text-xs font-medium transition-colors ${
                currentStep === 'payment' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'
              }`}
              onClick={() => setCurrentStep('payment')}
            >
              Payment
            </button>
          </div>

          <div className="p-3">
            {/* Package Selection Step */}
            {currentStep === 'packages' && (
              <div className="space-y-3">
                <p className="text-white text-sm font-medium">Select Points Package</p>
                
                <div className="grid grid-cols-2 gap-2">
                  {packages.map((pkg) => (
                    <div 
                      key={pkg.id}
                      className="relative cursor-pointer"
                      onClick={() => handlePackageSelect(pkg.id)}
                    >
                      {/* Selection box */}
                      <div className="absolute top-1 left-1 z-10">
                        <div 
                          className="w-4 h-4 flex items-center justify-center"
                          style={{
                            background: '#1C1A35',
                            borderRadius: '50%',
                            border: '1px solid #B6A3FF'
                          }}
                        >
                          {selectedPackage === pkg.id && (
                            <div 
                              className="w-2.5 h-2.5"
                              style={{
                                background: 'linear-gradient(0deg, #8D6EFF 0%, #B19CFF 100%)',
                                borderRadius: '50%'
                              }}
                            ></div>
                          )}
                        </div>
                      </div>
                      
                      {/* Package content */}
                      <div className="bg-[#2A2B3D] p-2 rounded-lg h-28 flex flex-col items-center justify-center">
                        <div className="flex justify-center mb-1">
                          <Image src={pkg.image} alt={`${pkg.points} Points`} width={20} height={20} className="w-5 h-5" />
                        </div>
                        <div className="text-center flex-1 flex flex-col justify-center">
                          <div className="flex items-center justify-center text-yellow-400 mb-1">
                            <Image src="/payment/coin.png" alt="Coin" width={8} height={8} className="mr-1 w-2 h-2" />
                            <span className="text-xs font-medium">{pkg.points.toLocaleString()}</span>
                          </div>
                          {pkg.bonus && pkg.bonus > 0 && (
                            <div className="flex items-center justify-center mb-1">
                              <span className="text-green-400 text-[9px] font-medium">+{Math.round(pkg.bonus * 100)}% bonus</span>
                            </div>
                          )}
                          <div 
                            className="text-white text-xs px-2 py-1 rounded w-full text-center"
                            style={{
                              background: '#8868FF',
                              borderRadius: '4px'
                            }}
                          >
                            ${pkg.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <button 
                  className="w-full mt-4 px-4 py-2 rounded-lg text-white font-medium text-sm"
                  style={{
                    background: selectedPackage ? '#8868FF' : '#666',
                    borderRadius: '8px'
                  }}
                  onClick={() => setCurrentStep('review')}
                  disabled={!selectedPackage}
                >
                  Next: Review Order
                </button>
              </div>
            )}

            {/* Review Step - Shows order summary */}
            {currentStep === 'review' && (
              <div className="space-y-3">
                <p className="text-white text-sm font-medium">Review Order</p>
                
                {/* Order Summary */}
                <div 
                  className="p-3 rounded-lg"
                  style={{
                    background: 'rgba(136, 104, 255, 0.1)',
                    borderRadius: '8px'
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm">Points:</span>
                    <div className="flex items-center text-yellow-400">
                      <Image src="/payment/coin.png" alt="Coin" width={12} height={12} className="mr-1 w-3 h-3" />
                      <span className="text-sm font-bold">
                        {selectedPackageDetails ? (
                          Math.floor(selectedPackageDetails.points * (1 + (selectedPackageDetails.bonus || 0)) * (affiliateApplied ? 1.05 : 1)).toLocaleString()
                        ) : '3,000'}
                      </span>
                      {selectedPackageDetails && (affiliateApplied || (selectedPackageDetails.bonus || 0) > 0) && (
                        <span className="text-green-400 text-xs ml-1">
                          (+{(Math.floor(selectedPackageDetails.points * (1 + (selectedPackageDetails.bonus || 0)) * (affiliateApplied ? 1.05 : 1)) - selectedPackageDetails.points).toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm">Total:</span>
                    <span className="text-white text-lg font-bold">
                      ${selectedPackageDetails ? selectedPackageDetails.price.toFixed(2) : '25.00'}
                    </span>
                  </div>
                </div>
                
                {/* Affiliate/Gift Code */}
                <div className="space-y-2">
                  <div className="text-white text-xs font-medium">Optional Codes</div>
                  
                  {/* Affiliate code input */}
                  {!affiliateApplied ? (
                    <div 
                      className="p-2"
                      style={{
                        background: 'rgba(123,107,181,0.1)',
                        borderRadius: '8px',
                        border: '1px solid #7B6BB5'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Image src="/payment/affiliate.png" alt="Affiliate" width={12} height={12} className="w-3 h-3" />
                        <input 
                          type="text" 
                          placeholder="Affiliate Code" 
                          className="flex-1 bg-transparent text-white focus:outline-none placeholder-gray-400 text-xs"
                          value={affiliateCode}
                          onChange={(e) => setAffiliateCode(e.target.value)}
                        />
                        <button 
                          className="px-3 py-1 text-white text-xs rounded"
                          style={{
                            background: '#8868FF',
                            borderRadius: '6px'
                          }}
                          onClick={handleApplyAffiliateCode}
                        >
                          Apply
                        </button>
                      </div>
                      {affiliateError && (
                        <div className="text-red-500 text-xs mt-1">{affiliateError}</div>
                      )}
                    </div>
                  ) : (
                    <div 
                      className="p-2"
                      style={{
                        background: 'rgba(123,107,181,0.1)',
                        borderRadius: '8px',
                        border: '1px solid #7B6BB5'
                      }}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Image src="/payment/affiliate.png" alt="Affiliate" width={12} height={12} className="w-3 h-3" />
                        <span className="text-green-400 text-xs">Affiliate Code Applied Successfully</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Gift code input */}
                  <div 
                    className="p-2"
                    style={{
                      background: 'rgba(123,107,181,0.1)',
                      borderRadius: '8px',
                      border: '1px solid #7B6BB5'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Image src="/payment/gift.png" alt="Gift" width={12} height={12} className="w-3 h-3" />
                      <input 
                        type="text" 
                        placeholder="Gift Code" 
                        className="flex-1 bg-transparent text-white focus:outline-none placeholder-gray-400 text-xs"
                        value={giftCode}
                        onChange={(e) => setGiftCode(e.target.value)}
                      />
                      <button 
                        className="px-3 py-1 text-white text-xs rounded"
                        style={{
                          background: '#8868FF',
                          borderRadius: '6px'
                        }}
                        onClick={() => setError('Gift code is not valid')}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4">
                  <button 
                    className="flex-1 px-4 py-2 rounded-lg text-white font-medium text-sm"
                    style={{
                      background: '#666',
                      borderRadius: '8px'
                    }}
                    onClick={() => setCurrentStep('packages')}
                  >
                    Back
                  </button>
                  <button 
                    className="flex-1 px-4 py-2 rounded-lg text-white font-medium text-sm"
                    style={{
                      background: '#8868FF',
                      borderRadius: '8px'
                    }}
                    onClick={() => {
                      loadPaymentMethods();
                      setCurrentStep('payment');
                    }}
                  >
                    Next: Payment
                  </button>
                </div>
              </div>
            )}

            {/* Payment Step - Shows payment methods and pay button */}
            {currentStep === 'payment' && (
              <div className="space-y-3">
                <p className="text-white text-sm font-medium">
                  {selectedPaymentMethod === WALLET_METHOD_ID ? 'Complete Payment' : 'Select Payment Method'}
                </p>

                {/* Order summary (match desktop and review step) */}
                <div 
                  className="p-3 rounded-lg"
                  style={{
                    background: 'rgba(136, 104, 255, 0.1)',
                    borderRadius: '8px'
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm">Points:</span>
                    <div className="flex items-center text-yellow-400">
                      <Image src="/payment/coin.png" alt="Coin" width={12} height={12} className="mr-1 w-3 h-3" />
                      <span className="text-sm font-bold">
                        {selectedPackageDetails ? (
                          Math.floor(selectedPackageDetails.points * (1 + (selectedPackageDetails.bonus || 0)) * (affiliateApplied ? 1.05 : 1)).toLocaleString()
                        ) : '3,000'}
                      </span>
                      {selectedPackageDetails && (affiliateApplied || (selectedPackageDetails.bonus || 0) > 0) && (
                        <span className="text-green-400 text-xs ml-1">
                          (+{(Math.floor(selectedPackageDetails.points * (1 + (selectedPackageDetails.bonus || 0)) * (affiliateApplied ? 1.05 : 1)) - selectedPackageDetails.points).toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm">Total:</span>
                    <span className="text-white text-lg font-bold">
                      ${selectedPackageDetails ? selectedPackageDetails.price.toFixed(2) : '25.00'}
                    </span>
                  </div>
                </div>
                
                {/* Show only Apple Pay interface when wallet is selected */}
                {selectedPaymentMethod === WALLET_METHOD_ID && walletClientSecret ? (
                  <div className="space-y-3 relative" style={{ touchAction: 'pan-y' }}>
                    <Elements stripe={stripePromise} options={{ 
                      clientSecret: walletClientSecret,
                      appearance: {
                        theme: 'night'
                      }
                    }}>
                      <div className="relative" style={{ minHeight: '100px', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>
                        <PaymentElement 
                          options={{
                            layout: {
                              type: 'accordion',
                              defaultCollapsed: false,
                              radios: false,
                              spacedAccordionItems: false
                            },
                            wallets: {
                              applePay: walletLabel === 'Apple Pay' ? 'auto' : 'never',
                              googlePay: walletLabel === 'Google Pay' ? 'auto' : 'never'
                            },
                            // Only render the selected wallet in the element
                            paymentMethodOrder: walletLabel === 'Apple Pay' ? ['apple_pay'] : ['google_pay']
                          }}
                        />
                      </div>
                      <WalletConfirmButton 
                        onError={(msg) => setError(msg)} 
                        onSuccess={(piId) => {
                          if (piId) {
                            handlePaymentSuccess(piId);
                          } else {
                            // Fallback: close and notify parent if no id (shouldn't happen on success)
                            onClose();
                            if (onSuccess) onSuccess();
                          }
                        }}
                        price={selectedPackageDetails ? selectedPackageDetails.price : 25}
                      />
                      <button 
                        className="w-full px-4 py-2 rounded-lg text-white font-medium text-sm"
                        style={{
                          background: '#666',
                          borderRadius: '8px'
                        }}
                        onClick={() => setSelectedPaymentMethod('')}
                      >
                        Back to Payment Methods
                      </button>
                    </Elements>
                  </div>
                ) : (
                  /* Show payment method selection */
                  <>
                    {loadingPaymentMethods ? (
                      <div className="text-white text-sm">Loading payment methods...</div>
                    ) : (
                      <div className="space-y-2">
                        {/* Saved cards */}
                        {paymentMethods.map((method) => (
                          <div 
                            key={method.id}
                            className="relative p-3 cursor-pointer flex items-center"
                            style={{
                              background: selectedPaymentMethod === method.id ? 'rgba(136,104,255,0.2)' : 'rgba(136,104,255,0.1)',
                              borderRadius: '8px',
                              border: selectedPaymentMethod === method.id ? '2px solid #8868FF' : '1px solid #8868FF'
                            }}
                            onClick={() => handlePaymentMethodSelect(method.id)}
                          >
                            {/* Selection indicator */}
                            <div>
                              <div 
                                className="w-4 h-4 flex items-center justify-center"
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
                            </div>
                            <div className="flex items-center ml-3">
                              <span className="text-white text-sm font-medium">
                                {method.card.brand.toUpperCase()} •••• {method.card.last4}
                              </span>
                              {method.card.brand.toLowerCase() === 'visa' && (
                                <Image className='ml-2' src="/payment/visaIcon.png" alt="VISA" width={40} height={25} />
                              )}
                              {method.is_default && (
                                <span className="ml-2 text-xs text-green-400">(Default)</span>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {/* Wallet selection option */}
                        {walletClientSecret && walletLabel && (
                          <div 
                            className="relative p-3 cursor-pointer flex items-center" 
                            onClick={() => setSelectedPaymentMethod(WALLET_METHOD_ID)} 
                            style={{ 
                              background: selectedPaymentMethod === WALLET_METHOD_ID ? 'rgba(136,104,255,0.2)' : 'rgba(136,104,255,0.1)', 
                              borderRadius: '8px', 
                              border: selectedPaymentMethod === WALLET_METHOD_ID ? '2px solid #8868FF' : '1px solid #8868FF' 
                            }}
                          >
                            <div className="w-4 h-4 flex items-center justify-center" style={{ background: selectedPaymentMethod === WALLET_METHOD_ID ? '#8868FF' : 'transparent', borderRadius: '50%', border: '2px solid #8868FF' }}>
                              {selectedPaymentMethod === WALLET_METHOD_ID && (
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              )}
                            </div>
                            <Image src={walletLabel === 'Apple Pay' ? '/payment/apple.png' : '/payment/google.png'} alt={walletLabel} width={20} height={20} className="ml-3" />
                            <span className="text-white text-sm font-medium ml-2">{walletLabel}</span>
                          </div>
                        )}

                        {/* Add payment method button */}
                        <button
                          className="w-full p-3 border-2 border-dashed border-gray-500 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors flex items-center justify-center text-sm"
                          onClick={handleAddPaymentMethod}
                        >
                          <span className="text-xl mr-2">+</span>
                          Add new payment method
                        </button>
                      </div>
                    )}
                    
                    {/* Payment button for card payments */}
                    {selectedPaymentMethod && selectedPaymentMethod !== WALLET_METHOD_ID && (
                      <button 
                        className="w-full px-4 py-3 rounded-lg text-white font-medium text-sm"
                        style={{
                          background: '#8868FF',
                          borderRadius: '8px'
                        }}
                        onClick={handleBuy}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Processing...' : `Pay $${selectedPackageDetails ? selectedPackageDetails.price.toFixed(2) : '25.00'}`}
                      </button>
                    )}
                    
                    {/* Back button */}
                    <button 
                      className="w-full px-4 py-2 rounded-lg text-white font-medium text-sm"
                      style={{
                        background: '#666',
                        borderRadius: '8px'
                      }}
                      onClick={() => setCurrentStep('review')}
                    >
                      Back
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
       </motion.div>
       
       
       {/* Credit card binding modal */}
       <CreditCardModal
         isOpen={showCreditCardModal}
         onClose={() => setShowCreditCardModal(false)}
         onSuccess={handleCreditCardSuccess}
         amount={selectedPackageDetails?.price || 25}
         points={selectedPackageDetails?.points || 3000}
         bonus={selectedPackageDetails?.bonus || 0}
         referCode={affiliateCode}
         mode="add-payment-method"
       />
    </div>
  )
}