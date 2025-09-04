'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface PriceRangeFilterProps {
  type: 'cash' | 'points'
  minValue?: number
  maxValue?: number
  onMinChange: (value: number | undefined) => void
  onMaxChange: (value: number | undefined) => void
  className?: string
}

const CASH_PRESETS = [
  { label: 'Any', min: undefined, max: undefined },
  { label: 'Under $10', min: undefined, max: 10 },
  { label: '$10-25', min: 10, max: 25 },
  { label: '$25-50', min: 25, max: 50 },
  { label: '$50-100', min: 50, max: 100 },
  { label: 'Over $100', min: 100, max: undefined },
]

const POINTS_PRESETS = [
  { label: 'Any', min: undefined, max: undefined },
  { label: 'Under 100', min: undefined, max: 100 },
  { label: '100-500', min: 100, max: 500 },
  { label: '500-1000', min: 500, max: 1000 },
  { label: '1000-5000', min: 1000, max: 5000 },
  { label: 'Over 5000', min: 5000, max: undefined },
]

export default function PriceRangeFilter({
  type,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  className = ''
}: PriceRangeFilterProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [localMin, setLocalMin] = useState<string>('')
  const [localMax, setLocalMax] = useState<string>('')

  const presets = type === 'cash' ? CASH_PRESETS : POINTS_PRESETS
  const symbol = type === 'cash' ? '$' : ''
  const unit = type === 'points' ? ' pts' : ''

  useEffect(() => {
    setLocalMin(minValue?.toString() || '')
    setLocalMax(maxValue?.toString() || '')
  }, [minValue, maxValue])

  const handlePresetClick = (preset: typeof CASH_PRESETS[0]) => {
    onMinChange(preset.min)
    onMaxChange(preset.max)
    setShowCustom(false)
  }

  const handleCustomApply = () => {
    const min = localMin ? (type === 'cash' ? parseFloat(localMin) : parseInt(localMin)) : undefined
    const max = localMax ? (type === 'cash' ? parseFloat(localMax) : parseInt(localMax)) : undefined
    onMinChange(min)
    onMaxChange(max)
  }

  const isPresetActive = (preset: typeof CASH_PRESETS[0]) => {
    return preset.min === minValue && preset.max === maxValue
  }

  const hasActiveFilter = minValue !== undefined || maxValue !== undefined

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-400 text-sm flex items-center gap-1">
          {type === 'points' && <Image src="/marketplace/coin.png" alt="Points" width={14} height={14} />}
          {type === 'cash' ? 'Price' : 'Points'} Range:
        </span>
        {hasActiveFilter && (
          <button
            onClick={() => {
              onMinChange(undefined)
              onMaxChange(undefined)
              setShowCustom(false)
            }}
            className="text-xs text-purple-400 hover:text-purple-300"
          >
            Clear
          </button>
        )}
      </div>
      
      {!showCustom ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset, index) => (
            <button
              key={index}
              onClick={() => handlePresetClick(preset)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isPresetActive(preset)
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#1E1F35] text-gray-300 hover:bg-[#2A2B3D] border border-gray-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1E1F35] text-gray-300 hover:bg-[#2A2B3D] border border-gray-600"
          >
            Custom
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{symbol}</span>
            <input
              type="number"
              placeholder="Min"
              value={localMin}
              onChange={(e) => setLocalMin(e.target.value)}
              className={`bg-[#1E1F35] text-white border border-gray-600 rounded px-6 py-1.5 text-sm w-24 ${symbol && 'pl-6'}`}
              min="0"
              step={type === 'cash' ? '0.01' : '1'}
            />
          </div>
          <span className="text-gray-400">-</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{symbol}</span>
            <input
              type="number"
              placeholder="Max"
              value={localMax}
              onChange={(e) => setLocalMax(e.target.value)}
              className={`bg-[#1E1F35] text-white border border-gray-600 rounded px-6 py-1.5 text-sm w-24 ${symbol && 'pl-6'}`}
              min="0"
              step={type === 'cash' ? '0.01' : '1'}
            />
          </div>
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setShowCustom(false)
              setLocalMin('')
              setLocalMax('')
            }}
            className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}