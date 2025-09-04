'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push('/');
        }
      }}
      className="text-[#8868FF] hover:underline mb-6 inline-block"
    >
      ← Back
    </button>
  );
}

export default function HowToShippingPage() {
  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white p-8 pt-24 sm:pt-8">
      <div className="max-w-4xl mx-auto">
        <BackButton />
        
        <h1 className="text-4xl font-bold mb-8">Shipping Information</h1>
        
        <div className="space-y-8">
          {/* Shipping Zones */}
          <section className="bg-[#1A1B2E] rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Shipping Zones & Fees</h2>
            
            <div className="space-y-4">
              <div className="bg-[#2A2B3D] rounded-lg p-4">
                <h3 className="text-xl font-medium text-[#8868FF] mb-2">Zone 1: United States</h3>
                <p className="text-gray-300 mb-2">All US states and territories</p>
                <div className="space-y-1">
                  <p><span className="text-gray-400">Shipping Fee:</span> <span className="font-medium">550 points</span></p>
                  <p><span className="text-gray-400">Free Shipping:</span> <span className="text-green-400 font-medium">Orders over 15,000 points</span></p>
                </div>
              </div>
              
              <div className="bg-[#2A2B3D] rounded-lg p-4">
                <h3 className="text-xl font-medium text-[#8868FF] mb-2">Zone 2: Canada, Mexico, UK</h3>
                <p className="text-gray-300 mb-2">Canada, Mexico, and United Kingdom</p>
                <div className="space-y-1">
                  <p><span className="text-gray-400">Shipping Fee:</span> <span className="font-medium">1,000 points</span></p>
                  <p><span className="text-gray-400">Free Shipping:</span> <span className="text-green-400 font-medium">Orders over 30,000 points</span></p>
                </div>
              </div>
              
              <div className="bg-[#2A2B3D] rounded-lg p-4">
                <h3 className="text-xl font-medium text-[#8868FF] mb-2">Zone 3: Select International</h3>
                <p className="text-gray-300 mb-2">Germany, France, Australia, Italy</p>
                <div className="space-y-1">
                  <p><span className="text-gray-400">Shipping Fee:</span> <span className="font-medium">1,500 points</span></p>
                  <p><span className="text-gray-400">Free Shipping:</span> <span className="text-green-400 font-medium">Orders over 45,000 points</span></p>
                </div>
              </div>
              
              <div className="bg-orange-900/20 border border-orange-600/50 rounded-lg p-4 mt-4">
                <p className="text-orange-400 text-sm">
                  <strong>Note:</strong> Shipping is currently only available to the countries listed above. 
                  If your country is not listed, shipping service is not available at this time.
                </p>
              </div>
            </div>
          </section>
          
          {/* How to Get Free Shipping */}
          <section className="bg-[#1A1B2E] rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">How to Get Free Shipping</h2>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-[#8868FF] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="font-bold">1</span>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Accumulate Card Value</h3>
                  <p className="text-gray-400">The total value is calculated based on the point worth of all cards in your withdrawal request.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-[#8868FF] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="font-bold">2</span>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Combine Multiple Cards</h3>
                  <p className="text-gray-400">Add more cards to your withdrawal request to reach the free shipping threshold for your zone.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-[#8868FF] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="font-bold">3</span>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Wait for High-Value Cards</h3>
                  <p className="text-gray-400">Consider waiting to withdraw until you have enough high-value cards to qualify for free shipping.</p>
                </div>
              </div>
            </div>
          </section>
          
          {/* Important Information */}
          <section className="bg-[#1A1B2E] rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Important Information</h2>
            
            <div className="space-y-3">
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400">•</span>
                <p className="text-gray-300">Withdrawal requests are processed daily at 4 AM EDT</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400">•</span>
                <p className="text-gray-300">You can modify or cancel your withdrawal request before it&apos;s processed</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400">•</span>
                <p className="text-gray-300">Once processed, cards are permanently removed from your digital inventory</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400">•</span>
                <p className="text-gray-300">Shipping fees are deducted from your points when order is processed. Please ensure you have enough points at that time otherwise the order processing will fail</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400">•</span>
                <p className="text-gray-300">Maximum 12 cards per withdrawal order</p>
              </div>
            </div>
          </section>
          
          {/* Delivery Time */}
          <section className="bg-[#1A1B2E] rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Estimated Delivery Time</h2>
            
            <p className="text-gray-400">2-4 weeks after processing</p>
            
            <p className="text-gray-400 text-sm mt-4">
              Note: Delivery times may vary due to customs, holidays, or carrier delays.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}