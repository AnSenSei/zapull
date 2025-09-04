'use client'

import { useState } from 'react'
import Image from 'next/image'

interface CardPointsFilterProps {
  onSelectRange: (minPoints: number | undefined, maxPoints: number | undefined) => void
  className?: string
  disabled?: boolean
}

const POINTS_PRESETS = [
  { label: 'Under 50', min: undefined, max: 50 },
  { label: 'Under 100', min: undefined, max: 100 },
  { label: 'Under 250', min: undefined, max: 250 },
  { label: 'Under 500', min: undefined, max: 500 },
  { label: 'Under 1000', min: undefined, max: 1000 },
  { label: 'Over 1000', min: 1000, max: undefined },
]

export default function CardPointsFilter({
  onSelectRange,
  className = '',
  disabled = false
}: CardPointsFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [localMin, setLocalMin] = useState<string>('')
  const [localMax, setLocalMax] = useState<string>('')

  const handlePresetClick = (preset: typeof POINTS_PRESETS[0]) => {
    onSelectRange(preset.min, preset.max)
    setIsOpen(false)
    setShowCustom(false)
  }

  const handleCustomApply = () => {
    const min = localMin ? parseInt(localMin) : undefined
    const max = localMax ? parseInt(localMax) : undefined
    onSelectRange(min, max)
    setIsOpen(false)
    setShowCustom(false)
    setLocalMin('')
    setLocalMax('')
  }

  const handleClearFilter = () => {
    onSelectRange(undefined, undefined)
    setIsOpen(false)
    setShowCustom(false)
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
          disabled
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-[#8868FF] hover:bg-[#7759EE] text-white cursor-pointer'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span className="text-sm">Filter by Points</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false)
              setShowCustom(false)
              setLocalMin('')
              setLocalMax('')
            }}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full mt-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-3 left-0 w-80">
            <div className="mb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Image src="/marketplace/coin.png" alt="Points" width={12} height={12} />
                <span className="text-gray-300 text-xs font-medium">Select cards by point value:</span>
              </div>
            </div>

            {!showCustom ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {POINTS_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => handlePresetClick(preset)}
                      className="px-2 py-1.5 rounded text-xs font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 hover:border-purple-500"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full mt-2 px-2 py-1.5 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600 hover:border-purple-500"
                >
                  Custom Range
                </button>
                
                <button
                  onClick={handleClearFilter}
                  className="w-full px-2 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Clear Filter
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder="Min"
                    value={localMin}
                    onChange={(e) => setLocalMin(e.target.value)}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-base focus:outline-none focus:border-purple-500 w-16"
                    style={{ fontSize: '16px' }} // Prevent iOS zoom
                    min="0"
                    step="1"
                  />
                  <span className="text-gray-400 text-xs">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={localMax}
                    onChange={(e) => setLocalMax(e.target.value)}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-base focus:outline-none focus:border-purple-500 w-16"
                    style={{ fontSize: '16px' }} // Prevent iOS zoom
                    min="0"
                    step="1"
                  />
                </div>
                
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCustomApply}
                    className="flex-1 px-2 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                  >
                    Apply Filter
                  </button>
                  <button
                    onClick={() => {
                      setShowCustom(false)
                      setLocalMin('')
                      setLocalMax('')
                    }}
                    className="flex-1 px-2 py-1.5 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
