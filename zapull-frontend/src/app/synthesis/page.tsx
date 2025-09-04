'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import UserNavigation from '@/components/UserNavigation'
import { useCollection } from '@/components/layout/Navbar'
// import NormalSynthesis from '@/components/NormalSynthesis' // Temporarily disabled
import SpecialSynthesis from '@/components/SpecialSynthesis'
import FusionGuideModal from '@/components/FusionGuideModal'
import styles from './synthesis.module.css'

function SynthesisPageContent() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState('special'); // 'normal' or 'special' - default to special
  const [selectedCollection, setSelectedCollection] = useState<string>(''); // Initialize empty; will be set from URL or collections
  const [isDetailView, setIsDetailView] = useState(false); // Track if showing detail view
  const [selectedPack, setSelectedPack] = useState<string | undefined>(undefined); // Pack to auto-expand
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  const { userInfo } = useAuthStore() // Get user info
  const { collections, loadingCollections } = useCollection()
  
  // Set default collection to pokemon if available and handle URL parameters
  useEffect(() => {
    // Check URL parameters
    const collectionParam = searchParams.get('collection')
    const packParam = searchParams.get('pack')
    
    if (collectionParam) {
      setSelectedCollection(collectionParam)
    } else if (!loadingCollections && collections.length > 0 && selectedCollection === '') {
      const pokemonCollection = collections.find(c => c.id === 'pokemon')
      if (pokemonCollection) {
        setSelectedCollection('pokemon')
      } else {
        setSelectedCollection(collections[0].id)
      }
    }
    
    if (packParam) {
      try {
        setSelectedPack(decodeURIComponent(packParam))
      } catch {
        setSelectedPack(packParam)
      }
    }
  }, [collections, loadingCollections, searchParams])

  return (
    <div className={`min-h-screen bg-cover bg-center bg-no-repeat text-white ${styles.specialSynthesisMobile || ''}`}>
      <FusionGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      <div className="space-y-6">
        {/* User info bar and navigation */}
        <UserNavigation />
        
        {/* Synthesis type tabs - Hide in detail view */}
        {!isDetailView && (
          <div className="w-full mx-auto mb-8">
            <div className="flex justify-center bg-[#1F1D2B] rounded-lg p-1">
              <button 
                className={`flex-1 py-3 px-2 rounded-md transition-all font-medium cursor-not-allowed opacity-50 text-gray-500 relative md:px-4`}
                onClick={(e) => e.preventDefault()}
                disabled
              >
                <span className="md:inline block">Normal fusion</span>
                <span className="text-xs mt-1 text-gray-400 md:block hidden">Coming Soon</span>
                <span className="text-xs text-gray-400 md:hidden"> (Soon)</span>
              </button>
              <button 
                className={`flex-1 py-3 px-2 rounded-md transition-all font-medium text-center md:px-4 ${activeTab === 'special' ? 'bg-[#6C5DD3] text-white' : 'text-gray-400'}`}
                onClick={() => setActiveTab('special')}
              >
                Special fusion
              </button>
            </div>
          </div>
        )}
        
        {/* Page title + Guide trigger - Hide in detail view */}
        {!isDetailView && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-3">
              <h1 
                className="text-[32px] font-bold text-center"
                style={{
                  background: 'linear-gradient(89deg, #BDA9FF 0%, #F4F1FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Fusion
              </h1>
              <div
                className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg px-3 py-2 flex items-center gap-2"
                onClick={() => setIsGuideOpen(true)}
                role="button"
                aria-label="Open fusion guide"
                style={{ zIndex: 10 }}
              >
                <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
                <span className="text-white text-sm">Guide</span>
              </div>
            </div>
          </div>
        )}
      <div className="w-[95%] sm:w-[90%] md:w-[85%] lg:w-[80%] mx-auto px-2 sm:px-3 md:px-4 flex items-center justify-center">
        {/* Only render special synthesis component - normal synthesis temporarily disabled */}
        <SpecialSynthesis 
          selectedCollection={selectedCollection}
          setSelectedCollection={setSelectedCollection}
          onDetailViewChange={setIsDetailView}
          initialPack={selectedPack}
        />
      </div>
      </div>

    </div>
  )
}

export default function SynthesisPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cover bg-center bg-no-repeat text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <SynthesisPageContent />
    </Suspense>
  )
}