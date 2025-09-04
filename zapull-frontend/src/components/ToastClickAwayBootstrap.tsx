"use client";

// Small client component that ensures our toast patches and click-away listener are attached once.
import { useEffect } from 'react'
import '../lib/patchHotToastSuccess'
import { attachSuccessToastClickAway, detachSuccessToastClickAway } from '../lib/toastClickAway'

export default function ToastClickAwayBootstrap() {
  useEffect(() => {
    attachSuccessToastClickAway()
    return () => detachSuccessToastClickAway()
  }, [])
  return null
}

