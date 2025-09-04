'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastProps {
  toast: ToastMessage
  onClose: (id: string) => void
}

const Toast = ({ toast, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id)
    }, toast.duration || 3000)

    return () => clearTimeout(timer)
  }, [toast, onClose])

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-600 text-white'
      case 'error':
        return 'bg-red-600 text-white'
      case 'warning':
        return 'bg-yellow-600 text-white'
      case 'info':
      default:
        return 'bg-purple-600 text-white'
    }
  }

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✓'
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      case 'info':
      default:
        return 'ℹ'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className={`${getToastStyles()} px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 min-w-[300px] max-w-[500px]`}
    >
      <span className="text-xl">{getIcon()}</span>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => onClose(toast.id)}
        className="text-white/80 hover:text-white transition-colors"
      >
        ✕
      </button>
    </motion.div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onClose: (id: string) => void
}

export const ToastContainer = ({ toasts, onClose }: ToastContainerProps) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col space-y-2">
      <AnimatePresence>
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Toast context and hook for global usage
import { createContext, useContext, ReactNode } from 'react'

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = (type: ToastType, message: string, duration?: number) => {
    const id = Date.now().toString()
    const newToast: ToastMessage = { id, type, message, duration }
    setToasts(prev => [...prev, newToast])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  )
}