'use client'

import { AnimatePresence, motion } from 'framer-motion'

interface ConfirmActionModalProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export default function ConfirmActionModal({
  isOpen,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />

          {/* dialog */}
          <motion.div
            className="relative z-[61] w-[90%] max-w-sm rounded-lg border border-purple-500/50 bg-[#1E1F35] p-4 text-white shadow-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
          >
            {title && (
              <div className="mb-2 text-lg font-semibold">{title}</div>
            )}
            <div className="text-sm text-gray-200">{message}</div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-md border border-gray-600 bg-transparent px-3 py-1.5 text-sm text-gray-200 hover:border-gray-400"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className="rounded-md bg-gradient-to-r from-purple-600 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

