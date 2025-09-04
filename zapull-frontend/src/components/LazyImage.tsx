'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

function convertGsToHttps(u: string): string {
  if (!u) return u
  if (u.startsWith('gs://')) {
    const path = u.replace(/^gs:\/\//, '') // bucket/path/to/file
    return `https://storage.googleapis.com/${path}`
  }
  return u
}

interface LazyImageProps {
  src: string
  alt: string
  fill?: boolean
  width?: number
  height?: number
  className?: string
  placeholder?: string
  onError?: () => void
  eager?: boolean // render immediately (skip IntersectionObserver)
}

export default function LazyImage({ 
  src, 
  alt, 
  fill, 
  width, 
  height, 
  className, 
  placeholder = '',
  onError,
  eager 
}: LazyImageProps) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)

  // Normalize source (e.g., convert gs://bucket/path to https://storage.googleapis.com/bucket/path)
  const normalizedSrc = convertGsToHttps(src)

  useEffect(() => {
    // If eager or fill is true, render immediately and skip observer
    if (eager || fill) {
      setIsIntersecting(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true)
          observer.disconnect()
        }
      },
      {
        threshold: 0,
        rootMargin: '200px'
      }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  const handleError = () => {
    setHasError(true)
    if (onError) {
      onError()
    }
  }

  const handleLoad = () => {
    setImageLoaded(true)
  }

  // Only show image if we have a valid src and it's either intersecting or we have an error
  const shouldShowImage = normalizedSrc && (isIntersecting || hasError)
  // Use actual src if available and intersecting, otherwise empty
  const imageSrc = normalizedSrc && isIntersecting && !hasError ? normalizedSrc : ''

  return (
    <div ref={imgRef} className={`relative ${fill ? 'w-full h-full' : ''}`}>
      {shouldShowImage && (imageSrc || eager || fill) && (
        fill ? (
          <Image
            src={imageSrc}
            alt={alt}
            fill
            className={className}
            onError={handleError}
            onLoad={handleLoad}
            priority={false}
          />
        ) : (
          <Image
            src={imageSrc}
            alt={alt}
            width={width}
            height={height}
            className={className}
            onError={handleError}
            onLoad={handleLoad}
            priority={false}
          />
        )
      )}
      {(!imageLoaded || (!isIntersecting && !eager && !fill) || hasError || !normalizedSrc) && (
        <div className="absolute inset-0 bg-gray-700 animate-pulse rounded" />
      )}
    </div>
  )
}