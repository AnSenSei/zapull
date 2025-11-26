'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { paymentApi, ShopOrder } from '@/lib/paymentApi';

interface ShopOrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}

export default function ShopOrderDetailsModal({ isOpen, onClose, orderId }: ShopOrderDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrderDetails();
    }
  }, [isOpen, orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await paymentApi.getShopOrderDetail(orderId);
      setOrder(data);
    } catch (err) {
      console.error('Failed to fetch order details:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'authorized':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'confirmed':
      case 'processing':
        return 'bg-blue-500/20 text-blue-500';
      case 'shipped':
        return 'bg-green-500/20 text-green-500';
      case 'delivered':
        return 'bg-green-600/20 text-green-600';
      case 'cancelled':
        return 'bg-red-500/20 text-red-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Shop Order Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="text-white">Loading...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 text-red-500 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {!loading && !error && order && (
          <div className="overflow-y-auto flex-1">
            {/* Order Info */}
            <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
              <h3 className="text-white font-medium mb-3">Order Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Status:</span>
                  <span className={`ml-2 inline-block px-2 py-1 rounded-full text-xs ${getStatusColor(order.status)}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Shipping Status:</span>
                  <span className="text-white ml-2">{order.shipping_status}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400">Order Date:</span>
                  <span className="text-white ml-2">{formatDate(order.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
              <h3 className="text-white font-medium mb-3">Payment Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Subtotal:</span>
                  <span className="text-white">${order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Shipping:</span>
                  <span className="text-white">${order.shipping_cost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tax:</span>
                  <span className="text-white">${order.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-600 pt-2 mt-2">
                  <span className="text-white font-medium">Total:</span>
                  <span className="text-white font-medium">${order.amount_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Payment ID:</span>
                  <span className="text-gray-500 font-mono">{order.payment_id}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            {order.shipping_address && (
              <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
                <h3 className="text-white font-medium mb-3">Shipping Address</h3>
                <div className="text-sm text-gray-300">
                  <p>{order.shipping_address.name}</p>
                  <p>{order.shipping_address.street}</p>
                  {order.shipping_address.street2 && <p>{order.shipping_address.street2}</p>}
                  <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}</p>
                  <p>{order.shipping_address.country}</p>
                  {order.shipping_address.phone && (
                    <p className="mt-2">Phone: {order.shipping_address.phone}</p>
                  )}
                </div>
              </div>
            )}

            {/* Tracking Info */}
            {(order as any).tracking_number && (
              <div className="bg-[#2A2B3D] rounded-lg p-4 mb-4">
                <h3 className="text-white font-medium mb-3">Tracking Information</h3>
                <div className="text-sm">
                  <div className="mb-2">
                    <span className="text-gray-400">Tracking Number:</span>
                    <span className="text-white ml-2 font-mono">{(order as any).tracking_number}</span>
                  </div>
                  {(order as any).tracking_url && (
                    <a 
                      href={(order as any).tracking_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 bg-[#8B5CF6] text-white rounded-lg hover:bg-[#7C3AED] transition-colors"
                    >
                      Track Package
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            <div className="bg-[#2A2B3D] rounded-lg p-4">
              <h3 className="text-white font-medium mb-3">Items ({order.card_count})</h3>
              <div className="space-y-3">
                {order.cards && order.cards.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 bg-[#1A1B2E] rounded-lg p-3">
                    {item.image_url && (
                      <div className="relative w-16 h-20 flex-shrink-0">
                        <Image
                          src={item.image_url}
                          alt={item.card_name}
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="text-white font-medium">{item.card_name}</h4>
                      <p className="text-gray-400 text-sm">Collection: {item.collection_id}</p>
                      <p className="text-gray-400 text-sm">Type: {item.type}</p>
                      {item.rarity && (
                        <p className="text-gray-400 text-sm">Rarity: {item.rarity}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-white">Qty: {item.quantity}</p>
                      <p className="text-gray-400 text-sm">${item.price.toFixed(2)} each</p>
                      <p className="text-white font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
