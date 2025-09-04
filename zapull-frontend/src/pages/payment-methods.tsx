import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { toastSuccess } from '@/lib/toast';
import { 
  getUserPaymentMethods, 
  removePaymentMethod, 
  getUserRechargeHistory
} from '@/lib/stripeIntegration';
import { getCurrentUserId } from '@/lib/authUtils';

interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  is_default: boolean;
}

interface RechargeRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  payment_method?: {
    type: string;
    card?: {
      brand: string;
      last4: string;
    };
  };
}

const PaymentMethodsPage: React.FC = () => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [rechargeHistory, setRechargeHistory] = useState<RechargeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'methods' | 'history'>('methods');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const userId = getCurrentUserId();
      
      if (!userId) {
        toast.error('Please login first');
        return;
      }

      // Load payment methods and recharge history in parallel
      const [methodsResponse, historyResponse] = await Promise.all([
        getUserPaymentMethods().catch(err => {
          console.error('Failed to get payment methods:', err);
          return { payment_methods: [] };
        }),
        getUserRechargeHistory().catch(err => {
          console.error('Failed to get recharge history:', err);
          return { records: [] };
        })
      ]);

      setPaymentMethods(methodsResponse.payment_methods || []);
      setRechargeHistory(historyResponse.records || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePaymentMethod = async (paymentMethodId: string) => {
    try {
      await removePaymentMethod(paymentMethodId);
      toastSuccess('Payment method deleted');
      loadData(); // Reload data
    } catch (error) {
      console.error('Failed to delete payment method:', error);
      toast.error('Failed to delete payment method');
    }
  };

  const getCardBrandIcon = (brand: string) => {
    switch (brand.toLowerCase()) {
      case 'visa':
        return '💳';
      case 'mastercard':
        return '💳';
      case 'amex':
        return '💳';
      default:
        return '💳';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'succeeded':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm">
          {/* Title */}
          <div className="border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Payment Management</h1>
            <p className="text-gray-600 mt-1">Manage your payment methods and view recharge history</p>
          </div>

          {/* Tab navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('methods')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'methods'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Payment Methods
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Recharge History
              </button>
            </nav>
          </div>

          {/* Content area */}
          <div className="p-6">
            {activeTab === 'methods' && (
              <div>
                {paymentMethods.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-6xl mb-4">💳</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No payment methods</h3>
                    <p className="text-gray-600 mb-6">Add payment methods for quick recharge</p>
                    <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      Add Payment Method
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentMethods.map((method) => (
                      <motion.div
                        key={method.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl">
                            {getCardBrandIcon(method.card?.brand || '')}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {method.card?.brand?.toUpperCase()} •••• {method.card?.last4}
                            </div>
                            <div className="text-sm text-gray-600">
                              Expires: {method.card?.exp_month}/{method.card?.exp_year}
                            </div>
                            {method.is_default && (
                              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mt-1">
                                Default
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemovePaymentMethod(method.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                {rechargeHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-6xl mb-4">📊</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No recharge history</h3>
                    <p className="text-gray-600">Your recharge history will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rechargeHistory.map((record) => (
                      <motion.div
                        key={record.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="text-2xl">💰</div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {formatAmount(record.amount)}
                              </div>
                              <div className="text-sm text-gray-600">
                                {formatDate(record.created_at)}
                              </div>
                              {record.payment_method && (
                                <div className="text-sm text-gray-600">
                                  {record.payment_method.card?.brand?.toUpperCase()} •••• {record.payment_method.card?.last4}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(record.status)}`}>
                            {record.status === 'succeeded' ? 'Success' : 
                             record.status === 'pending' ? 'Processing' : 
                             record.status === 'failed' ? 'Failed' : record.status}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodsPage;