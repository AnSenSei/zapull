'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { processRechargePayment, getUserRechargeHistory, formatAmount, getUserPaymentMethods } from '@/lib/stripeIntegration'
import { getCurrentUserId } from '@/lib/authUtils'
import { PaymentMethod } from '@/lib/paymentApi'
import CreditCardModal from './CreditCardModal'
import MobilePointsTopUpModal from './MobilePointsTopUpModal'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

interface PointsTopUpModalProps {
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

export default function PointsTopUpModal({ isOpen, onClose, onSuccess }: PointsTopUpModalProps) {
  // Check if it's mobile device
  const [isMobile, setIsMobile] = useState(false);
  
  // Get current user ID from auth state
  const userId = getCurrentUserId();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(2);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [affiliateCode, setAffiliateCode] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [affiliateMessage, setAffiliateMessage] = useState<string | null>(null);
  const [affiliateError, setAffiliateError] = useState<string | null>(null);
  const [affiliateApplied, setAffiliateApplied] = useState(false);
  
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
      toast.error('Failed to get payment methods');
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      setAffiliateCode('');
      setAffiliateMessage(null);
      setAffiliateError(null);
      setAffiliateApplied(false);
      setGiftCode('');
    }
  }, [isOpen]);


  // If mobile, use mobile component
  if (isMobile) {
    return <MobilePointsTopUpModal isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} />;
  }

  if (!isOpen) return null;
  
  // Recharge package options
  const packages: PackageOption[] = [
    { id: 1, points: 1000, price: 10, image: '/payment/coin-1.png' },
    { id: 2, points: 2500, price: 25, image: '/payment/coin-2.png' },
    { id: 3, points: 5000, price: 50, image: '/payment/coin-3.png' },
    { id: 4, points: 10000, price: 100, image: '/payment/coin-4.png', bonus: 0.05 },
    { id: 5, points: 25000, price: 250, image: '/payment/coin-5.png', bonus: 0.075 },
    { id: 6, points: 50000, price: 500, image: '/payment/coin-6.png', bonus: 0.10 },
  ];

  // Handle package selection
  const handlePackageSelect = (id: number) => {
    setSelectedPackage(id);
  };

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

  // Handle buy button click
  const handleBuy = async () => {
    if (!userId) {
      toast.error('User not logged in, please log in first');
      return;
    }
    
    if (selectedPackage === null) {
      toast.error('Please select a recharge package');
      return;
    }

    if (!selectedPaymentMethod) {
      toast.error('Please select a payment method');
      return;
    }

    // Get selected package details
    const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
    if (!selectedPkg) {
      toast.error('Selected package is invalid');
      return;
    }

    try {
      setIsLoading(true);

      // 1. Create payment intent
      const paymentIntent = await processRechargePayment({
        amount: selectedPkg.price,
        referCode: affiliateCode,
        payment_method_id: selectedPaymentMethod, // Pass selected payment method ID
        onError: (errorMessage) => {
          console.error('Failed to create payment intent:', errorMessage);
          toast.error(errorMessage);
        }
      });

      if (!paymentIntent) {
        throw new Error('Failed to create payment intent');
      }

      // 2. Confirm payment with Stripe
      const { getStripe } = await import('@/lib/stripeIntegration');
      const stripe = await getStripe();
      
      if (!stripe) {
        throw new Error('Stripe initialization failed');
      }

      // Choose confirmation method based on PaymentIntent status
      let confirmedPaymentIntent;
      let error;
      
      console.log('PaymentIntent status:', paymentIntent.status);
      console.log('PaymentIntent ID:', paymentIntent.id);
      console.log('Using payment method ID:', selectedPaymentMethod);
      
      if (paymentIntent.status === 'requires_payment_method') {
        // When status is requires_payment_method, use confirmCardPayment with payment method
        const { error: confirmError, paymentIntent: confirmed } = await stripe.confirmCardPayment(
          paymentIntent.client_secret,
          {
            payment_method: selectedPaymentMethod
          }
        );
        error = confirmError;
        confirmedPaymentIntent = confirmed;
      } else if (paymentIntent.status === 'requires_confirmation') {
        // When status is requires_confirmation, confirm directly
        const { error: confirmError, paymentIntent: confirmed } = await stripe.confirmCardPayment(
          paymentIntent.client_secret
        );
        error = confirmError;
        confirmedPaymentIntent = confirmed;
      } else {
        // Use standard confirmation flow for other statuses
        const { error: confirmError, paymentIntent: confirmed } = await stripe.confirmCardPayment(
          paymentIntent.client_secret,
          {
            payment_method: selectedPaymentMethod,
            customer: 'cus_SgU1Pl15bYBWJx'
          }
        );
        error = confirmError;
        confirmedPaymentIntent = confirmed;
      }

      if (error) {
        console.error('Payment confirmation error:', error);
        throw new Error(error.message || 'Payment confirmation failed');
      }

      // 3. Check payment status
      console.log('PaymentIntent status after confirmation:', confirmedPaymentIntent?.status);
      
      if (confirmedPaymentIntent?.status === 'succeeded') {
        // Payment successful, check status and refresh user info
        await handlePaymentSuccess(confirmedPaymentIntent.id);
      } else if (confirmedPaymentIntent?.status === 'processing') {
        // Payment processing
        toast.info('Payment is processing, please check later');
      } else if (confirmedPaymentIntent?.status === 'requires_action') {
        // Requires additional verification (e.g., 3D Secure)
        toast.warning('Payment requires additional verification, please follow the prompts');
      } else {
        toast.error(`Abnormal payment status: ${confirmedPaymentIntent?.status || 'unknown'}, please try again`);
      }

    } catch (error) {
      console.error('Payment failed:', error);
      toast.error(error instanceof Error ? error.message : 'Payment failed, please try again');
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
        toast.error('Abnormal payment status, please contact customer service');
      }
    } catch (error) {
      console.error('Failed to check payment status:', error);
      toast.error('Failed to check payment status, please contact customer service');
    }
  };

  const handleCreditCardSuccess = async () => {
    // Refresh payment methods list (whether payment successful or payment method added successfully)
    await loadPaymentMethods();
    setShowCreditCardModal(false);
  };

  // Get selected package details
  const selectedPackageDetails = selectedPackage ? packages.find(pkg => pkg.id === selectedPackage) : null;
  const totalPointsWithBonuses = selectedPackageDetails
    ? Math.floor(selectedPackageDetails.points * (1 + (selectedPackageDetails.bonus || 0)) * (affiliateApplied ? 1.05 : 1))
    : null;
  const totalBonusPoints = selectedPackageDetails
    ? totalPointsWithBonuses! - selectedPackageDetails.points
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-2 md:p-4">
      <motion.div 
          className="relative w-full max-w-5xl max-h-[95vh] md:max-h-[90vh] lg:max-h-[85vh] overflow-hidden"
          style={{
            background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
            borderRadius: '20px',
            border: '2px solid #8B5CF6'
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-20 bg-black bg-opacity-50 rounded-full p-1"
        >
          <Image src="/icons/close.png" alt="Close" width={20} height={20} />
        </button>
        
        {/* Content container with better responsive scrolling */}
        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-transparent hover:scrollbar-thumb-purple-400" 
             style={{ maxHeight: 'calc(95vh - 1rem)', '@media (min-width: 768px)': { maxHeight: 'calc(90vh - 1rem)' }, '@media (min-width: 1024px)': { maxHeight: 'calc(85vh - 1rem)' } }}>
        
        <div className="p-2 sm:p-4 lg:p-3">
          {/* Title - more compact on larger screens */}
          <div className="text-center mb-2 sm:mb-3 lg:mb-2">
            <h2 
              className="text-white mb-1 sm:mb-2 lg:mb-1"
              style={{
                fontWeight: 'bold',
                fontSize: '20px',
                color: '#FFFFFF'
              }}
            >
              POINTS TOP-UP
            </h2>
            {/* Decorative line - smaller on large screens to save space */}
            <div className="flex justify-center">
              <Image src="/home/boxhead-icon.png" alt="Decoration" width={250} height={25} className="w-48 h-5 sm:w-72 sm:h-7 lg:w-48 lg:h-4" />
            </div>
          </div>
          
          {/* Main content area */}
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 min-w-0">
            {/* Left side: Payment method selection */}
            <div className="w-full lg:w-80 lg:flex-shrink-0">
              <p className="text-white mb-3 text-sm sm:text-base font-medium">Select Purchase Method</p>
              
              {loadingPaymentMethods ? (
                <div className="text-white text-sm">Loading payment methods...</div>
              ) : (
                <div className="space-y-2">
                  {paymentMethods.map((method) => (
                    <div 
                      key={method.id}
                      className="relative p-3 lg:p-2.5 cursor-pointer flex items-center"
                      style={{
                        background: selectedPaymentMethod === method.id ? 'rgba(136,104,255,0.2)' : 'rgba(136,104,255,0.1)',
                        borderRadius: '10px',
                        border: selectedPaymentMethod === method.id ? '2px solid #8868FF' : '1px solid #8868FF'
                      }}
                      onClick={() => handlePaymentMethodSelect(method.id)}
                    >
                      {/* Selection indicator */}
                      <div>
                        <div 
                          className="w-5 h-5 flex items-center justify-center"
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
                      <div className="flex items-center">
                        <span className="text-white text-sm font-medium ml-3">
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
                  
                {/* Add payment method button */}
                <button
                  className="w-full p-4 border-2 border-dashed border-gray-500 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors flex items-center justify-center"
                  onClick={handleAddPaymentMethod}
                >
                  <span className="text-2xl mr-2">+</span>
                  Add new payment method
                </button>

              </div>
            )}
            </div>
            
            {/* Right side: Amount selection */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {packages.map((pkg) => (
                  <div 
                    key={pkg.id}
                    className="relative cursor-pointer"
                    onClick={() => handlePackageSelect(pkg.id)}
                  >
                    {/* Selection box */}
                    <div className="absolute top-2 left-2 z-10">
                      <div 
                        className="w-5 h-5 flex items-center justify-center"
                        style={{
                          background: '#1C1A35',
                          borderRadius: '50%',
                          border: '1px solid #B6A3FF'
                        }}
                      >
                        {selectedPackage === pkg.id && (
                          <div 
                            className="w-3 h-3"
                            style={{
                              background: 'linear-gradient(0deg, #8D6EFF 0%, #B19CFF 100%)',
                              borderRadius: '50%'
                            }}
                          ></div>
                        )}
                      </div>
                    </div>
                    
                    {/* Package content */}
                    <div className="bg-[#2A2B3D] p-1.5 sm:p-2 lg:p-1.5 rounded-lg h-28 sm:h-48 lg:h-36 flex flex-col items-center">
                      <div className="flex justify-center mb-0.5 sm:mb-1">
                        <Image src={pkg.image} alt={`${pkg.points} Points`} width={40} height={40} className="w-8 h-8 sm:w-20 sm:h-20 lg:w-16 lg:h-16" />
                      </div>
                      <div className="text-center flex-1 flex flex-col justify-center">
                        <div className="flex items-center justify-center text-yellow-400 mb-0.5 sm:mb-1">
                          <Image src="/payment/coin.png" alt="Coin" width={10} height={10} className="mr-0.5 sm:mr-1 w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          <span className="text-[10px] sm:text-sm font-medium">{pkg.points.toLocaleString()}</span>
                        </div>
                        {pkg.bonus && pkg.bonus > 0 && (
                          <div className="flex items-center justify-center mb-0.5 sm:mb-1">
                            <span className="text-green-400 text-[9px] sm:text-xs font-medium">+{Math.round(pkg.bonus * 100)}% bonus</span>
                          </div>
                        )}
                        <button 
                          className="text-white text-[10px] sm:text-sm px-1.5 sm:px-4 py-0.5 sm:py-1.5 rounded w-full"
                          style={{
                            background: '#8868FF',
                            borderRadius: '6px'
                          }}
                        >
                          ${pkg.price.toFixed(2)}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Total Amount and Buy For button */}
          <div className="my-2 sm:my-3">
            <div className="w-full">
              <div className="text-white text-xs sm:text-base font-medium mb-1 sm:mb-2">Total Amount</div>
              <div 
                className="flex flex-col sm:flex-row items-center justify-between p-2 sm:p-4 rounded-lg gap-2 sm:gap-4"
                style={{
                  background: 'rgba(136, 104, 255, 0.1)',
                  borderRadius: '10px'
                }}
              >
                <div className="flex items-center text-yellow-400">
                  <Image src="/payment/coin.png" alt="Coin" width={16} height={16} className="mr-1 sm:mr-2 w-4 h-4 sm:w-6 sm:h-6" />
                  <span className="text-lg sm:text-2xl font-bold">
                    {selectedPackageDetails ? (
                      totalPointsWithBonuses?.toLocaleString()
                    ) : '3,000'}
                  </span>
                  {selectedPackageDetails && (affiliateApplied || (selectedPackageDetails.bonus || 0) > 0) && (
                    <span className="text-green-400 text-sm ml-2">
                      (+{totalBonusPoints.toLocaleString()} bonus)
                    </span>
                  )}
                </div>
                <button 
                  className="w-full sm:w-auto px-4 sm:px-8 py-1.5 sm:py-3 rounded-lg text-white font-medium text-sm sm:text-lg"
                  style={{
                    background: '#8868FF',
                    borderRadius: '8px'
                  }}
                  onClick={handleBuy}
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing...' : (selectedPackageDetails ? `Buy for $${selectedPackageDetails.price.toFixed(2)}` : 'Buy for $25.00')}
                </button>
              </div>
            </div>
          </div>
          
          {/* Divider */}
          <div 
            className="my-2 sm:my-3"
            style={{
              border: '1px solid #ae99ff',
              opacity: 0.1
            }}
          ></div>
          
          {/* Bottom input area */}
          <div className="mb-2 sm:mb-3">
            <div className="text-white text-[10px] sm:text-sm font-medium mb-1 sm:mb-2">Get 5% bonus gems with an affiliate code!</div>
            <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-4">
              {/* Referral code input */}
              {!affiliateApplied ? (
                <div 
                  className="p-1.5 sm:p-3 flex-1"
                  style={{
                    background: 'rgba(123,107,181,0.1)',
                    borderRadius: '12px',
                    border: '1px solid #7B6BB5'
                  }}
                >
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <Image src="/payment/affiliate.png" alt="Affiliate" width={14} height={14} className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                    <input 
                      type="text" 
                      placeholder="Enter Affiliate Code" 
                      className="flex-1 bg-transparent text-white focus:outline-none placeholder-gray-400 border border-gray-600 rounded px-1.5 sm:px-3 py-0.5 sm:py-2 text-[10px] sm:text-sm"
                      value={affiliateCode}
                      onChange={(e) => setAffiliateCode(e.target.value)}
                    />
                    <button 
                      className="px-2 sm:px-6 py-0.5 sm:py-2 text-white text-[10px] sm:text-sm rounded"
                      style={{
                        background: '#8868FF',
                        borderRadius: '6px'
                      }}
                      onClick={handleApplyAffiliateCode}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  className="p-1.5 sm:p-3 flex-1"
                  style={{
                    background: 'rgba(123,107,181,0.1)',
                    borderRadius: '12px',
                    border: '1px solid #7B6BB5'
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:gap-3">
                    <Image src="/payment/affiliate.png" alt="Affiliate" width={14} height={14} className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                    <span className="text-green-400 text-[10px] sm:text-sm">Applied successfully!</span>
                  </div>
                </div>
              )}
              
              {/* Affiliate error display */}
              {affiliateError && (
                <div className="mt-2 text-[10px] sm:text-sm text-red-400">
                  {affiliateError}
                </div>
              )}
              
              {/* Gift code input */}
              <div 
                className="p-1.5 sm:p-3 flex-1"
                style={{
                  background: 'rgba(123,107,181,0.1)',
                  borderRadius: '12px',
                  border: '1px solid #7B6BB5'
                }}
              >
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <Image src="/payment/gift.png" alt="Gift" width={14} height={14} className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                  <input 
                    type="text" 
                    placeholder="Enter Gift Code" 
                    className="flex-1 bg-transparent text-white focus:outline-none placeholder-gray-400 border border-gray-600 rounded px-1.5 sm:px-3 py-0.5 sm:py-2 text-[10px] sm:text-sm"
                    value={giftCode}
                    onChange={(e) => setGiftCode(e.target.value)}
                  />
                  <button 
                    className="px-2 sm:px-6 py-0.5 sm:py-2 text-white text-[10px] sm:text-sm rounded"
                    style={{
                      background: '#8868FF',
                      borderRadius: '6px'
                    }}
                    onClick={() => toast.error('Gift code is not valid')}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
         </div>
        </div>
       </motion.div>
       
       {/* Credit card binding modal */}
       {showCreditCardModal && (
         <CreditCardModal
           isOpen={showCreditCardModal}
           onClose={() => setShowCreditCardModal(false)}
           onSuccess={handleCreditCardSuccess}
           amount={selectedPackageDetails?.price || 25.00}
           points={selectedPackageDetails?.points || 3000}
           bonus={selectedPackageDetails?.bonus || 0}
           referCode={affiliateCode}
           mode="add-payment-method"
         />
       )}
    </div>
  )
}