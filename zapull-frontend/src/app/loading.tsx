'use client'

import Image from 'next/image'

export default function Loading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner Skeleton */}
      <section className="relative rounded-lg overflow-hidden border border-purple-500/20 bg-[#1E1F2E]">
        <div className="relative h-56 sm:h-72 md:h-96 lg:aspect-[27/9] xl:aspect-[27/9] animate-pulse bg-gradient-to-r from-[#2A2B3D] to-[#1E1F2E]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <svg className="animate-spin h-12 w-12 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-400 text-sm">Loading banner...</p>
            </div>
          </div>
        </div>
      </section>

      {/* Winners Section Skeleton */}
      <section className="space-y-2 sm:space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <div className="w-[62px] h-[60px] bg-[#2A2B3D] rounded animate-pulse"></div>
            <span style={{ background: 'linear-gradient(89deg, #BDA9FF 0%, #F4F1FF 100%)', WebkitTextFillColor: 'transparent', WebkitBackgroundClip: 'text' }}>Winners</span>
          </h2>
        </div>
        <div className="relative overflow-hidden">
          <div className="flex gap-2 sm:gap-4">
            {Array(8).fill(null).map((_, i) => (
              <div key={`winner-skeleton-${i}`} className="bg-[#2A2B3D] rounded-lg overflow-hidden animate-pulse flex-shrink-0 w-[100px] sm:w-[120px]">
                {/* User info skeleton */}
                <div className="flex items-center gap-2 text-white p-2" style={{ fontSize: '12px' }}>
                  <span className="text-[#8B5CF6]">★</span>
                  <div className="h-3 bg-[#3F3F5F] rounded w-16"></div>
                </div>
                
                {/* Card content skeleton */}
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
            ))}
          </div>
        </div>
      </section>

      {/* Packs Section Skeleton */}
      <section className="space-y-2 sm:space-y-4">
        {/* Filter area skeleton */}
        <div className="sticky top-14 sm:top-16 z-40 bg-[#1A1B2E]/95 sm:backdrop-blur-lg" style={{ boxShadow: '0 4px 20px rgba(139, 92, 246, 0.1)' }}>
          <div className="mx-auto max-w-[1600px] px-2 sm:px-3 md:px-4 lg:px-6 xl:px-8 2xl:px-10">
            <div className="py-3 transition-all duration-300">
              <div className="space-y-2">
                {/* Navigation skeleton */}
                <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
                  <div className="h-8 bg-[#2A2B3D] rounded-full w-16 animate-pulse"></div>
                  <div className="h-8 bg-[#2A2B3D] rounded-full w-16 animate-pulse"></div>
                  <div className="h-8 bg-[#2A2B3D] rounded-full w-20 animate-pulse"></div>
                  <div className="h-5 sm:h-6 w-px bg-gray-600/50 mx-1 sm:mx-2"></div>
                  <div className="h-8 bg-[#2A2B3D] rounded w-32 animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            <div className="h-6 bg-[#2A2B3D] rounded w-32 animate-pulse"></div>
          </h2>
        </div>
        
        {/* Packs grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 gap-2 sm:gap-4">
          {Array(12).fill(null).map((_, i) => (
            <div key={`pack-skeleton-${i}`} className="rounded-lg overflow-hidden animate-pulse" style={{ background: 'linear-gradient(-3deg, rgba(136,104,255,0.2), rgba(136,104,255,0.1))' }}>
              {/* Pack image skeleton */}
              <div className="aspect-square bg-[#1A1B2E] p-4">
                <div className="w-full h-full bg-[#3F3F5F] rounded"></div>
              </div>
              
              {/* Bottom section skeleton */}
              <div className="bg-[#8868FF] bg-opacity-60">
                {/* Pack name skeleton */}
                <div className="flex items-center justify-center py-2 px-2">
                  <div className="h-4 bg-white bg-opacity-30 rounded w-20"></div>
                </div>
                
                {/* Stats skeleton */}
                <div className="flex items-center justify-between text-xs px-2 sm:px-3 py-2 gap-1 sm:gap-0">
                  <div className="h-3 bg-white bg-opacity-30 rounded w-12"></div>
                  <div className="w-1 sm:w-px h-6 sm:h-8 bg-white bg-opacity-30"></div>
                  <div className="h-3 bg-white bg-opacity-30 rounded w-12"></div>
                  <div className="w-1 sm:w-px h-6 sm:h-8 bg-white bg-opacity-30"></div>
                  <div className="h-3 bg-white bg-opacity-30 rounded w-12"></div>
                </div>
                
                {/* Price button skeleton */}
                <div className="w-full py-3 border-t border-white/10 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 bg-white bg-opacity-30 rounded-full"></div>
                  <div className="h-4 bg-white bg-opacity-30 rounded w-12"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
