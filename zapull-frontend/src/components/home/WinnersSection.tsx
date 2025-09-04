'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { getRecentWinners, Winner } from '@/lib/winnerService'

// Simple helper to optimize images with Cloudflare Image Resizing
const optimizeImage = (url: string, options: { quality?: number; width?: number; height?: number } = {}) => {
  if (!url) return url
  
  // Extract the domain from the image URL
  const urlObj = new URL(url)
  const domain = urlObj.origin
  const path = urlObj.pathname + urlObj.search
  
  const { quality = 80, width, height } = options
  const params = [`format=auto`, `quality=${quality}`]
  
  if (width) params.push(`width=${width}`)
  if (height) params.push(`height=${height}`)
  
  return `${domain}/cdn-cgi/image/${params.join(',')}${path}`
}

export default function WinnersSection() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const router = useRouter()

  const fetchWinners = useCallback(async () => {
    try {
      setLoading(true)
      const winnersData = await getRecentWinners(20)
      setWinners(winnersData)
    } catch (err) {
      setError(err as Error)
      console.error('Failed to fetch winners:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWinners()
    // Auto-refresh every minute
    const interval = setInterval(fetchWinners, 60000)
    return () => clearInterval(interval)
  }, [fetchWinners])

  if (error) {
    return (
      <section className="space-y-2 sm:space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-red-400">Could not load winners</h2>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-2 sm:space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Image 
            src="/home/winner-icon.png" 
            alt="Winners Icon" 
            width={62} 
            height={60} 
            className="object-contain"
          />
          <span style={{ background: 'linear-gradient(89deg, #BDA9FF 0%, #F4F1FF 100%)', WebkitTextFillColor: 'transparent', WebkitBackgroundClip: 'text' }}>Winners</span>
        </h2>
      </div>
      <div className="relative overflow-hidden">
        <div className="flex gap-2 sm:gap-4 animate-scroll">
          {loading ? (
            // Loading skeleton
            Array(8).fill(null).map((_, i) => (
              <div key={`winner-skeleton-${i}`} className="bg-[#2A2B3D] rounded-lg overflow-hidden animate-pulse flex-shrink-0 w-[100px] sm:w-[120px]">
                <div className="flex items-center gap-2 text-white p-2" style={{ fontSize: '12px' }}>
                  <span className="text-[#8B5CF6]">★</span>
                  <span>Loading...</span>
                </div>
                <div className="bg-[#1E1F2E] rounded-lg overflow-hidden">
                  <div className="aspect-square bg-[#3F3F5F]"></div>
                  <div className="p-2 text-center bg-[#2B2C4E]">
                    <div className="h-4 bg-[#3F3F5F] rounded w-20 mx-auto"></div>
                    <div className="flex items-center justify-center mt-2">
                      <div className="h-4 w-4 bg-[#3F3F5F] rounded-full mr-1"></div>
                      <div className="h-4 bg-[#3F3F5F] rounded w-12"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : winners.length > 0 ? (
            // Display winners data with duplicates for seamless scroll
            [...winners, ...winners].map((winner, index) => (
              <div key={`${winner.id}-${index}`} className="bg-[#2A2B3D] rounded-lg overflow-hidden flex-shrink-0 w-[100px] sm:w-[120px] hover:transform hover:scale-105 transition-transform duration-200">
                {/* User info */}
                <div 
                  className="flex items-center gap-2 text-white p-2 cursor-pointer hover:bg-[#3F3F5F] transition-colors" 
                  style={{ fontSize: '12px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (winner.userId) {
                      router.push(`/user/${winner.userId}?from=home`);
                    }
                  }}
                >
                  <span className="text-[#8B5CF6]">★</span>
                  <span className="truncate">{winner.username || 'Unknown'}</span>
                </div>
                
                {/* Card content */}
                <div 
                  className="bg-[#1E1F2E] rounded-lg overflow-hidden cursor-pointer"
                  onClick={() => {
                    if (winner.pack_id && winner.pack_collection_id) {
                      router.push(`/packs/${winner.pack_collection_id}/${winner.pack_id}`);
                    }
                  }}
                >
                  {/* Card image */}
                  <div className="relative overflow-hidden aspect-square">
                    {winner.imageUrl && (
                      <Image 
                        src={optimizeImage(winner.imageUrl, { width: 120, height: 120, quality: 80 })} 
                        alt={typeof winner.itemName === 'object' ? winner.itemName.name : String(winner.itemName)} 
                        fill
                        className="object-contain"
                        sizes="(max-width: 640px) 100px, 120px"
                      />
                    )}
                  </div>
                  
                  {/* Card name and price */}
                  <div className="p-2 text-center bg-[#2B2C4E]">
                    <h3 className="text-white font-medium truncate text-xs">
                      {typeof winner.itemName === 'object' ? winner.itemName.name : String(winner.itemName)}
                    </h3>
                    <div className="flex items-center justify-center text-white font-bold mt-1" style={{ fontSize: '16px' }}>
                      <Image 
                        src="/users/coin.png" 
                        alt="Coin" 
                        width={16} 
                        height={16} 
                        className="mr-1"
                      />
                      {winner.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // No data
            <div className="text-center py-8 text-gray-400 w-full">
              No winners yet
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
