'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'

interface SortOption {
  id: string
  label: string
  value: string
  order: 'asc' | 'desc'
  icon?: string
  iconImage?: string
}

interface ImprovedSortDropdownProps {
  value: string // Combined value like 'priceCash_asc'
  onChange: (value: string) => void
  options: SortOption[]
  className?: string
}

const DEFAULT_OPTIONS: SortOption[] = [
  { id: 'recent', label: 'Recently Listed', value: 'createdAt', order: 'desc', icon: '🕐' },
  { id: 'price_low', label: 'Cash: Low to High', value: 'priceCash', order: 'asc', icon: '💵' },
  { id: 'price_high', label: 'Cash: High to Low', value: 'priceCash', order: 'desc', icon: '💵' },
  { id: 'points_low', label: 'Points: Low to High', value: 'pricePoints', order: 'asc', iconImage: '/marketplace/coin.png' },
  { id: 'points_high', label: 'Points: High to Low', value: 'pricePoints', order: 'desc', iconImage: '/marketplace/coin.png' },
]

export default function ImprovedSortDropdown({ 
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  className = ''
}: ImprovedSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleOpen = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuRect({ 
        top: rect.bottom + 4, 
        left: rect.left, 
        width: Math.max(rect.width, 220)
      })
      setIsOpen(true)
    }
  }

  const handleSelect = (option: SortOption) => {
    onChange(`${option.value}_${option.order}`)
    setIsOpen(false)
  }

  // Find current option
  const currentOption = options.find(opt => 
    value === `${opt.value}_${opt.order}`
  ) || options[0]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`bg-[#1E1F35] text-white border border-gray-600 rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#2A2B3D] transition-colors min-w-[180px] ${className}`}
      >
        <div className="flex items-center gap-2">
          {currentOption.iconImage ? (
            <Image src={currentOption.iconImage} alt="" width={14} height={14} />
          ) : currentOption.icon ? (
            <span className="text-sm">{currentOption.icon}</span>
          ) : null}
          <span className="text-sm font-medium">{currentOption.label}</span>
        </div>
        <svg className="w-4 h-4 ml-2 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && isOpen && menuRect && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[1000] bg-[#1E1F35] border border-gray-600 rounded-lg shadow-xl overflow-hidden"
            style={{ 
              top: menuRect.top, 
              left: menuRect.left, 
              width: menuRect.width
            }}
          >
            <div className="py-1">
              <div className="px-3 py-2 text-xs text-gray-400 font-semibold border-b border-gray-700">
                Sort By
              </div>
              {options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-3 py-2.5 text-sm text-white hover:bg-[#8868FF]/20 transition-colors flex items-center gap-2 ${
                    value === `${option.value}_${option.order}` ? 'bg-[#8868FF]/30' : ''
                  }`}
                >
                  {option.iconImage ? (
                    <Image src={option.iconImage} alt="" width={14} height={14} />
                  ) : option.icon ? (
                    <span className="text-sm">{option.icon}</span>
                  ) : null}
                  <span>{option.label}</span>
                  {value === `${option.value}_${option.order}` && (
                    <svg className="w-4 h-4 ml-auto text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}