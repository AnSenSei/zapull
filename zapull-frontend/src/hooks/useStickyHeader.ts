'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export function useStickyHeader() {
  const [isSticky, setIsSticky] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [stickyHeight, setStickyHeight] = useState(0)
  const stickyRef = useRef<HTMLDivElement>(null)
  const stickyContentRef = useRef<HTMLDivElement>(null)
  const [stickyOffset, setStickyOffset] = useState(0)

  const updateMobileState = useCallback(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  const calculateLayout = useCallback(() => {
    updateMobileState()
    if (stickyRef.current) {
      const rect = stickyRef.current.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const navHeight = window.innerWidth < 768 ? 56 : 64
      setStickyOffset(rect.top + scrollTop - navHeight)
    }
    if (stickyContentRef.current) {
      setStickyHeight(stickyContentRef.current.offsetHeight)
    }
  }, [updateMobileState])

  useEffect(() => {
    const timer = setTimeout(calculateLayout, 100)
    window.addEventListener('resize', calculateLayout, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', calculateLayout)
    }
  }, [calculateLayout])

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (document?.body?.dataset?.panelOpen === 'true') return
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop
          const isMobile = window.innerWidth < 768
          const threshold = isMobile ? stickyOffset - 10 : stickyOffset
          const shouldStick = scrollTop >= threshold

          if (shouldStick !== isSticky) {
            setIsSticky(shouldStick)
          }
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('touchmove', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('touchmove', handleScroll)
    }
  }, [isSticky, stickyOffset])

  return { isSticky, isMobile, stickyHeight, stickyRef, stickyContentRef }
}
