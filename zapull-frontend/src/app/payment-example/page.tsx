'use client'

import { useState } from 'react'
import PointsTopUpModal from '@/components/PointsTopUpModal'
import CreditCardModal from '@/components/CreditCardModal'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

export default function PaymentExamplePage() {
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  

  
  // 处理信用卡绑定成功
  const handleCreditCardSuccess = () => {
    console.log('银行卡绑定成功');
    setShowCreditCardModal(false);
    toastSuccess('银行卡绑定成功！');
  };

  return (
    <div className="min-h-screen bg-[#1A1B2C] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">支付组件示例</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-[#2A2B3D] p-6 rounded-lg">
            <h2 className="text-xl font-bold text-white mb-4">积分充值弹窗</h2>
            <p className="text-gray-300 mb-4">
              用户可以选择不同的充值套餐，并通过信用卡、Google Pay或Apple Pay进行支付。
            </p>
            <button 
              className="bg-[#8868FF] hover:bg-[#7858EF] text-white font-bold py-2 px-4 rounded"
              onClick={() => setShowTopUpModal(true)}
            >
              打开积分充值弹窗
            </button>
          </div>
          
          <div className="bg-[#2A2B3D] p-6 rounded-lg">
            <h2 className="text-xl font-bold text-white mb-4">银行卡绑定弹窗</h2>
            <p className="text-gray-300 mb-4">
              用户可以通过Stripe安全地绑定银行卡信息，用于后续的充值支付。
            </p>
            <button 
              className="bg-[#8868FF] hover:bg-[#7858EF] text-white font-bold py-2 px-4 rounded"
              onClick={() => setShowCreditCardModal(true)}
            >
              打开银行卡绑定弹窗
            </button>
          </div>
        </div>
      </div>
      
      {/* 积分充值弹窗 */}
      <PointsTopUpModal 
        isOpen={showTopUpModal} 
        onClose={() => setShowTopUpModal(false)}
      />
      
      {/* 银行卡绑定弹窗 */}
      <CreditCardModal 
        isOpen={showCreditCardModal} 
        onClose={() => setShowCreditCardModal(false)}
        onSuccess={handleCreditCardSuccess}
        amount={99.99}
        points={10000}
        bonus={1000}
        referCode="EXAMPLE123"
      />
    </div>
  )
}