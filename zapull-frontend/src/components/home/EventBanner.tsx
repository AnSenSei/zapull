'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/authUtils'

interface EventBannerProps {
  isMobile: boolean
}

export default function EventBanner({ isMobile }: EventBannerProps) {
  const router = useRouter()
  const { openRegisterModal } = useAuthStore()
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  
  // Use actual files under public/event
  // Updated: move existing event3.webp to position 4 and add whatnot.webp as position 3 for both desktop and mobile
  const pcFileNames = ['event1.webp', 'box_chanllange.webp', 'whatnot.webp', 'event3.webp']
  const mobileFileNames = ['event1.webp', 'box_chanllange.webp', 'whatnot.webp', 'event3.webp']
  const pcBannerImages = pcFileNames.map(n => `/event/pc_event/${n}`)
  const mobileBannerImages = mobileFileNames.map(n => `/event/mobile/${n}`)
  const currentBannerImages = isMobile ? mobileBannerImages : pcBannerImages
  const [bannerIndex, setBannerIndex] = useState(0)
  const [imagesLoaded, setImagesLoaded] = useState<Set<string>>(new Set())

  // Preload banner images for better performance
  useEffect(() => {
    const preloadImages = async () => {
      const promises = currentBannerImages.map(src => {
        return new Promise<string>((resolve, reject) => {
          const img = document.createElement('img')
          img.onload = () => {
            setImagesLoaded(prev => new Set(prev).add(src))
            resolve(src)
          }
          img.onerror = reject
          img.src = src
        })
      })
      
      try {
        await Promise.allSettled(promises)
      } catch (error) {
        console.warn('Some banner images failed to preload:', error)
      }
    }

    preloadImages()
  }, [currentBannerImages])

  // Auto-rotate banner carousel
  useEffect(() => {
    const len = currentBannerImages.length
    if (len <= 1) return
    const id = setInterval(() => {
      setBannerIndex((i) => (i + 1) % len)
    }, 4000)
    return () => clearInterval(id)
  }, [currentBannerImages.length])

  return (
    <section className="relative rounded-lg overflow-hidden border border-purple-500/20 bg-[#1E1F2E]">
      <div className="relative h-56 sm:h-72 md:h-96 lg:h-auto lg:aspect-[27/9] xl:aspect-[27/9]">
        {currentBannerImages.map((src, i) => (
          <div key={src} className={`absolute inset-0 transition-opacity duration-700 ${i === bannerIndex ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            {/* Background fill using blurred, scaled cover */}
            <div className="absolute inset-0 lg:hidden">
              <Image 
                src={src} 
                alt="" 
                fill 
                priority={i === 0} // Priority for first image
                className="object-cover blur-lg scale-110 opacity-40" 
              />
            </div>
            {/* Foreground crisp image without cropping; first slide shows CTA buttons */}
            <div
              className={`absolute inset-0 p-0 ${i === 0 || i === 1 || i === 2 || i === 3 ? 'cursor-pointer' : ''}`}
              onClick={() => { 
                if (i === 0) { 
                  openRegisterModal(); 
                } else if (i === 1) { 
                  // Challenge banner: Redirect to Discord
                  window.open('https://discord.gg/WjjHxsjCrm', '_blank');
                } else if (i === 2) { 
                  // Whatnot banner: Redirect to Whatnot profile
                  window.open('https://www.whatnot.com/user/zapull', '_blank');
                } else if (i === 3) {
                  // Events banner moved to slide 4
                  router.push('/events'); 
                }
              }}
            >
              <Image 
                src={src} 
                alt={`Event banner ${i + 1}`} 
                fill 
                priority={i === 0} // Priority for first image
                className={`object-cover transition-opacity duration-300 ${imagesLoaded.has(src) ? 'opacity-100' : 'opacity-0'}`}
              />
              {i === 0 && (
                <div className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3 z-10">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openRegisterModal(); }}
                    className="px-3 sm:px-4 lg:px-6 xl:px-7 py-1.5 sm:py-2 lg:py-3 xl:py-3.5 rounded-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs sm:text-sm lg:text-base xl:text-lg font-semibold shadow transition-colors duration-200"
                  >
                    Sign up
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); router.push('/how-it-works'); }}
                    className="px-3 sm:px-4 lg:px-6 xl:px-7 py-1.5 sm:py-2 lg:py-3 xl:py-3.5 rounded-full bg-[#1E1F2E] border border-white/30 text-white text-xs sm:text-sm lg:text-base xl:text-lg hover:bg-[#2A2B3D] transition-colors duration-200"
                  >
                    How it works
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* Controls */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => setBannerIndex((i) => (i - 1 + currentBannerImages.length) % currentBannerImages.length)}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 hover:bg-black/50 text-white px-3 py-1 transition-colors duration-200"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => setBannerIndex((i) => (i + 1) % currentBannerImages.length)}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 hover:bg-black/50 text-white px-3 py-1 transition-colors duration-200"
        >
          ›
        </button>
        
        {/* Dots (hidden on mobile) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden sm:flex gap-2 z-10">
          {currentBannerImages.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setBannerIndex(i)}
              className={`rounded-full transition-colors duration-200 ${i === bannerIndex ? 'bg-white' : 'bg-white/50'} h-1.5 w-1.5 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
