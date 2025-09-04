'use client'

import { useState, useEffect, useCallback } from 'react'
import { getRecentWinners, Winner } from '@/lib/winnerService'
import { packsApi, Pack } from '@/lib/packsApi'
import { useCollection } from '@/components/layout/Navbar'
import { getCachedData, setCachedData, deleteCachedData } from '@/lib/cacheUtils'

export const useHomeData = () => {
  const [winners, setWinners] = useState<Winner[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [allPacks, setAllPacks] = useState<Pack[]>([])
  const [loadingWinners, setLoadingWinners] = useState(true)
  const [loadingPacks, setLoadingPacks] = useState(true)
  const [winnersError, setWinnersError] = useState<Error | null>(null)
  const [packsError, setPacksError] = useState<Error | null>(null)
  
  const { selectedCollectionId, loadingCollections } = useCollection()

  // Fetch winners data with caching
  const fetchWinners = useCallback(async () => {
    const cacheKey = 'recent-winners'
    const cached = getCachedData<Winner[]>(cacheKey)
    
    if (cached) {
      setWinners(cached)
      setLoadingWinners(false)
      return
    }

    try {
      setLoadingWinners(true)
      setWinnersError(null)
      const winnersData = await getRecentWinners(20)
      setWinners(winnersData)
      setCachedData(cacheKey, winnersData, 1 * 60 * 1000) // Cache for 1 minute
    } catch (error) {
      console.error('Failed to fetch winners data:', error)
      setWinnersError(error as Error)
    } finally {
      setLoadingWinners(false)
    }
  }, [])

  // Fetch packs data with caching
  const fetchPacks = useCallback(async (collectionId: string) => {
    if (!collectionId || collectionId === 'undefined') return

    const cacheKey = `packs-${collectionId}`
    const cached = getCachedData<Pack[]>(cacheKey)
    
    if (cached) {
      setAllPacks(cached)
      setLoadingPacks(false)
      return
    }

    try {
      setLoadingPacks(true)
      setPacksError(null)
      const packsResponse = await packsApi.getPacksByCollection(collectionId, {
        page: 1,
        per_page: 1000,
        sort_order: 'desc',
        sort_by: 'popularity'
      })
      
      setAllPacks(packsResponse.packs)
      setCachedData(cacheKey, packsResponse.packs, 3 * 60 * 1000) // Cache for 3 minutes
    } catch (error) {
      console.error('Failed to fetch packs list:', error)
      setPacksError(error as Error)
    } finally {
      setLoadingPacks(false)
    }
  }, [])

  // Initial data fetch - run winners and collections in parallel
  useEffect(() => {
    // Always fetch winners immediately (parallel with collections)
    fetchWinners()

    // Set up auto-refresh for winners every minute
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && (document.body as any)?.dataset?.panelOpen === 'true') return
      fetchWinners()
    }, 60000)

    return () => clearInterval(interval)
  }, [fetchWinners])

  // Fetch packs when collection is ready
  useEffect(() => {
    if (!loadingCollections && selectedCollectionId && selectedCollectionId !== 'undefined') {
      fetchPacks(selectedCollectionId)
    }
  }, [loadingCollections, selectedCollectionId, fetchPacks])

  // Provide refresh functions for manual refresh
  const refreshWinners = useCallback(() => {
    deleteCachedData('recent-winners')
    fetchWinners()
  }, [fetchWinners])

  const refreshPacks = useCallback(() => {
    if (selectedCollectionId) {
      deleteCachedData(`packs-${selectedCollectionId}`)
      fetchPacks(selectedCollectionId)
    }
  }, [selectedCollectionId, fetchPacks])

  return {
    // Data
    winners,
    allPacks,
    
    // Loading states
    loadingWinners,
    loadingPacks: loadingPacks || loadingCollections,
    
    // Error states
    winnersError,
    packsError,
    
    // Refresh functions
    refreshWinners,
    refreshPacks,
    
    // Computed loading state
    isInitialLoading: loadingWinners || loadingPacks || loadingCollections
  }
}
