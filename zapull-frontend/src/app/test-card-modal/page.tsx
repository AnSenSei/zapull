'use client'

import { useState } from 'react'
import CardDetailModal from '@/components/CardDetailModal'
import { Card } from '@/lib/packsApi'

export default function TestCardModal() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // 测试用的卡片数据
  const testCard: Card = {
    id: 'test-card-1',
    document_id: 'test-doc-1',
    name: 'Test Trading Card',
    image_url: '/placeholder-card.jpg',
    point_worth: 150,
    cash_worth: 25.99,
    probability: 0.1,
    quantity: 1,
    rarity: 3,
    condition: 'mint',
    globalRef: 'test-global-ref-1',
    collection_id: 'test-collection'
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Card Modal Test Page</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Official Market Test */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-white mb-4">Official Market Test</h2>
            <p className="text-gray-400 mb-4">Test purchasing from official market</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Open Official Card Modal
            </button>
          </div>

          {/* Player Market Test */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-white mb-4">Player Market Test</h2>
            <p className="text-gray-400 mb-4">Test purchasing and making offers in player market</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Open Player Card Modal
            </button>
          </div>
        </div>

        <div className="mt-8 bg-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">Test Instructions</h3>
          <ul className="text-gray-400 space-y-2">
            <li>• Click the buttons above to open the card detail modal</li>
            <li>• Test the "Buy now" functionality for both points and cash</li>
            <li>• Test the "Make an offer" functionality for both points and cash</li>
            <li>• Check that loading states and error handling work correctly</li>
            <li>• Verify that the modal closes properly after actions</li>
          </ul>
        </div>
      </div>

      {/* Card Detail Modal */}
      <CardDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        card={testCard}
        channel="player" // Change to "official" to test official market
        userId="test-user-123"
        listingId="test-listing-456"
        onPurchase={(type, card) => {
          console.log('Purchase:', { type, card })
          alert(`Purchase initiated: ${type} for ${card.name}`)
        }}
      />
    </div>
  )
}