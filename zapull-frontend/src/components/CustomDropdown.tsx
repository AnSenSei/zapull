'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface CustomDropdownProps {
  value: string
  onChange: (value: string) => void
  options: { id: string; name: string }[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function CustomDropdown({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Select', 
  className = '',
  disabled = false 
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleOpen = () => {
    if (disabled) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuRect({ 
        top: rect.bottom + 4, 
        left: rect.left, 
        width: rect.width 
      })
      setIsOpen(true)
    }
  }

  const handleSelect = (optionId: string) => {
    onChange(optionId)
    setIsOpen(false)
  }

  const selectedOption = options.find(opt => opt.id === value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`bg-[#1E1F35] text-white border border-gray-600 rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#2A2B3D] transition-colors min-w-[180px] ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      >
        <span className="text-sm font-medium truncate">
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && isOpen && menuRect && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[1000] bg-[#1E1F35] border border-gray-600 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto"
            style={{ 
              top: menuRect.top, 
              left: menuRect.left, 
              width: menuRect.width,
              minWidth: '140px'
            }}
          >
            <div className="py-1">
              <div className="px-3 py-2 text-xs text-gray-400 font-semibold border-b border-gray-700">
                Select Collection
              </div>
              {options.map(option => (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`w-full text-left px-3 py-2.5 text-sm text-white hover:bg-[#8868FF]/20 transition-colors flex items-center gap-2 ${
                    value === option.id ? 'bg-[#8868FF]/30' : ''
                  }`}
                >
                  <span>{option.name}</span>
                  {value === option.id && (
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