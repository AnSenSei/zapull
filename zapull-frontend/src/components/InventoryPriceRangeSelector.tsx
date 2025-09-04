'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface InventoryPriceRangeSelectorProps {
  onSelectRange: (minPoints: number | undefined, maxPoints: number | undefined, excludeMaterials?: boolean, excludeExpired?: boolean) => void
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

export default function InventoryPriceRangeSelector({
  onSelectRange,
  className = '',
  disabled = false
}: InventoryPriceRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [localMin, setLocalMin] = useState<string>('')
  const [localMax, setLocalMax] = useState<string>('')
  const [excludeMaterials, setExcludeMaterials] = useState(false)
  const [excludeExpired, setExcludeExpired] = useState(false)

  const handlePresetClick = (preset: typeof POINTS_PRESETS[0]) => {
    onSelectRange(preset.min, preset.max, excludeMaterials, excludeExpired)
    setIsOpen(false)
    setShowCustom(false)
  }

  const handleCustomApply = () => {
    const min = localMin ? parseInt(localMin) : undefined
    const max = localMax ? parseInt(localMax) : undefined
    onSelectRange(min, max, excludeMaterials, excludeExpired)
    setIsOpen(false)
    setShowCustom(false)
    setLocalMin('')
    setLocalMax('')
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
        </svg>
        <span className="text-sm">Select by Points</span>
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
          <div className={`absolute top-full mt-2 bg-[#1E1F35] border border-gray-600 rounded-lg shadow-xl z-50 p-3 transition-all duration-200 ${
            typeof window !== 'undefined' && window.innerWidth < 768 
              ? 'left-1/2 transform -translate-x-1/2 w-[280px]' 
              : 'left-0 w-80'
          }`}>
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
                      className="px-2 py-1.5 rounded text-xs font-medium transition-colors bg-[#2A2B3D] text-gray-300 hover:bg-[#3A3B4D] border border-gray-600 hover:border-purple-500"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full mt-2 px-2 py-1.5 rounded text-xs font-medium bg-[#2A2B3D] text-gray-300 hover:bg-[#3A3B4D] border border-gray-600 hover:border-purple-500"
                >
                  Custom Range
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
                    className="flex-1 bg-[#2A2B3D] text-white border border-gray-600 rounded px-2 py-1.5 text-base focus:outline-none focus:border-purple-500 w-16"
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
                    className="flex-1 bg-[#2A2B3D] text-white border border-gray-600 rounded px-2 py-1.5 text-base focus:outline-none focus:border-purple-500 w-16"
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
                    Select Cards
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
            
            {/* Exclude Materials Toggle */}
            <div className="mt-3 pt-3 border-t border-gray-600 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-300">Exclude Materials</span>
                  <div className="relative group">
                    <span className="text-gray-400 hover:text-gray-300 cursor-help text-xs">🧪</span>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-black text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      Skip fusion materials
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExcludeMaterials(!excludeMaterials)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none border ${typeof window !== 'undefined' && window.innerWidth < 768 ? 'touch-manipulation' : ''} ${
                    excludeMaterials ? 'bg-purple-600 border-purple-400' : 'bg-gray-700 border-gray-600'
                  }`}
                  aria-pressed={excludeMaterials}
                  role="switch"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ${excludeMaterials ? 'bg-white' : 'bg-gray-300'} ${
                      excludeMaterials ? 'translate-x-6' : 'translate-x-1'
                    } shadow-sm`}
                  />
                </button>
              </div>
              
              {/* Exclude Expired Cards Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-300">Exclude Expired Cards</span>
                  <div className="relative group">
                    <span className="text-gray-400 hover:text-gray-300 cursor-help text-xs">⏰</span>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-black text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      Skip cards past buyback period
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExcludeExpired(!excludeExpired)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none border ${typeof window !== 'undefined' && window.innerWidth < 768 ? 'touch-manipulation' : ''} ${
                    excludeExpired ? 'bg-purple-600 border-purple-400' : 'bg-gray-700 border-gray-600'
                  }`}
                  aria-pressed={excludeExpired}
                  role="switch"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ${excludeExpired ? 'bg-white' : 'bg-gray-300'} ${
                      excludeExpired ? 'translate-x-6' : 'translate-x-1'
                    } shadow-sm`}
                  />
                </button>
              </div>
              
              <p className="text-xs text-gray-400 leading-tight flex items-center">
                <span className={`w-3 h-3 rounded-full mr-1.5 ${(excludeMaterials || excludeExpired) ? 'bg-purple-600' : 'bg-gray-600'}`}></span>
                Select all cards in range{excludeMaterials ? ', excluding materials' : ''}{excludeExpired ? ', excluding expired cards' : ''}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
