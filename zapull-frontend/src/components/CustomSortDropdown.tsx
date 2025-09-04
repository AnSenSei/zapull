'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface SortOption {
  value: string
  label: string
}

interface CustomSortDropdownProps {
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void
  options: SortOption[]
  className?: string
}

export default function CustomSortDropdown({ 
  sortBy, 
  sortOrder, 
  onSortChange, 
  options,
  className = ''
}: CustomSortDropdownProps) {
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
        width: Math.max(rect.width, 200) // Minimum width for sort options
      })
      setIsOpen(true)
    }
  }

  const handleSelect = (value: string, order: 'asc' | 'desc') => {
    onSortChange(value, order)
    setIsOpen(false)
  }

  // Get current label for display
  const getCurrentLabel = () => {
    const option = options.find(opt => opt.value === sortBy)
    if (!option) return 'Sort'
    return `${option.label}: ${sortOrder === 'asc' ? 'Low to High' : 'High to Low'}`
  }

  // Generate all sort combinations
  const allOptions = options.flatMap(option => [
    { value: option.value, order: 'asc' as const, label: `${option.label}: Low to High` },
    { value: option.value, order: 'desc' as const, label: `${option.label}: High to Low` }
  ])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`bg-[#1E1F35] text-white border border-gray-600 rounded px-2 py-1 text-sm flex items-center justify-between cursor-pointer hover:bg-[#2A2B3D] ${className}`}
      >
        <span className="truncate mr-2">
          {getCurrentLabel()}
        </span>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && isOpen && menuRect && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[1000] bg-[#1E1F35] border border-gray-600 rounded shadow-xl overflow-hidden max-h-60 overflow-y-auto"
            style={{ 
              top: menuRect.top, 
              left: menuRect.left, 
              width: menuRect.width
            }}
          >
            {allOptions.map((option, index) => (
              <button
                key={`${option.value}-${option.order}`}
                onClick={() => handleSelect(option.value, option.order)}
                className={`w-full text-left px-3 py-2 text-sm text-white hover:bg-[#8868FF]/20 transition-colors ${
                  sortBy === option.value && sortOrder === option.order ? 'bg-[#8868FF]/30' : ''
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}