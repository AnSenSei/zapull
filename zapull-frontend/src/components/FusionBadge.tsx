'use client'

import { FusionInfo } from '@/lib/packsApi'
import Image from 'next/image'

interface FusionBadgeProps {
  fusionInfo?: FusionInfo[] | null | undefined  // For material cards
  isResultCard?: boolean  // For cards that can be created through fusion
  showTooltip?: boolean
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export default function FusionBadge({ 
  fusionInfo, 
  isResultCard = false,
  showTooltip = false,  // Changed default to false to disable tooltip
  size = 'medium',
  className = ''
}: FusionBadgeProps) {
  // Show badge if it's a material card OR a result card
  const showMaterialBadge = fusionInfo && fusionInfo.length > 0
  const showResultBadge = isResultCard
  
  if (!showMaterialBadge && !showResultBadge) return null

  const sizeClasses = {
    small: 'text-[8px] px-1 py-0.5',
    medium: 'text-[10px] px-1.5 py-0.5',
    large: 'text-xs px-2 py-1'
  }

  const iconSizes = {
    small: 'text-[10px]',
    medium: 'text-xs',
    large: 'text-sm'
  }

  // If both badges should be shown, render them in a column
  if (showMaterialBadge && showResultBadge) {
    return (
      <div className={`${className} flex flex-col gap-1`}>
        {/* Material badge (top) */}
        <div className={`bg-purple-600 text-white font-bold rounded-full shadow-lg flex items-center gap-1 ${sizeClasses[size]} animate-pulse`}>
          <span className={iconSizes[size]}>🧪</span>
          <span>Material</span>
        </div>
        {/* Fusible badge (bottom) */}
        <div className={`bg-pink-600 text-white font-bold rounded-full shadow-lg flex items-center gap-1 ${sizeClasses[size]} animate-pulse`}>
          <span className={iconSizes[size]}>⭐</span>
          <span>Fusible</span>
        </div>
      </div>
    )
  }

  // Single badge logic (existing behavior)
  const badgeConfig = showResultBadge ? {
    bgColor: 'bg-pink-600',
    icon: '⭐',
    text: 'Fusible'
  } : {
    bgColor: 'bg-purple-600',
    icon: '🧪',
    text: 'Material'
  }

  return (
    <div className={className}>
      <div className={`${badgeConfig.bgColor} text-white font-bold rounded-full shadow-lg flex items-center gap-1 ${sizeClasses[size]} animate-pulse`}>
        <span className={iconSizes[size]}>{badgeConfig.icon}</span>
        <span>{badgeConfig.text}</span>
      </div>
    </div>
  )
}
