/**
 * Client-side video cache hook
 * 
 * This hook provides video caching functionality that is safe to use
 * in React components without causing SSR issues.
 */

import { useState, useEffect, useCallback } from 'react'

interface VideoCacheHook {
  getVideoUrl: (onProgress?: (progress: number) => void) => Promise<string>
  isLoading: boolean
  error: string | null
}

export const useVideoCache = (): VideoCacheHook => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getVideoUrl = useCallback(async (onProgress?: (progress: number) => void): Promise<string> => {
    const defaultUrl = 'https://draw.zapull.fun/draw_animate1.mp4'
    
    // Only attempt caching in browser environment
    if (typeof window === 'undefined') {
      return defaultUrl
    }

    try {
      setIsLoading(true)
      setError(null)
      
      // Dynamically import the video cache only when actually needed
      const { getDrawAnimationUrl } = await import('@/lib/videoCache')
      const cachedUrl = await getDrawAnimationUrl(onProgress)
      
      setIsLoading(false)
      return cachedUrl
    } catch (err) {
      console.warn('Failed to load cached video, using direct URL:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsLoading(false)
      return defaultUrl
    }
  }, [])

  return {
    getVideoUrl,
    isLoading,
    error
  }
}
