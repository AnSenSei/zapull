'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseCollectionSelectionOptions {
  /**
   * Storage key for localStorage
   * Default: 'selected_collection'
   */
  storageKey?: string;
  
  /**
   * Default collection ID to use if none is stored
   * Default: 'pokemon'
   */
  defaultCollection?: string;
}

/**
 * Custom hook for managing collection selection with persistence
 * 
 * This hook provides persistent collection selection that:
 * - Stores selection in localStorage (persists across browser sessions)
 * - Maintains the selected collection across page refreshes
 * - Provides a default fallback collection
 */
export function useCollectionSelection(options: UseCollectionSelectionOptions = {}) {
  const {
    storageKey = 'selected_collection',
    defaultCollection = 'pokemon'
  } = options;

  const [selectedCollection, setSelectedCollection] = useState<string>(defaultCollection);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load collection selection from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setSelectedCollection(stored);
      }
    } catch (error) {
      console.warn('Failed to load collection selection from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(storageKey);
    }
    
    setIsInitialized(true);
  }, [storageKey]);

  // Save collection selection to localStorage whenever it changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;

    try {
      if (selectedCollection) {
        localStorage.setItem(storageKey, selectedCollection);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.warn('Failed to save collection selection to localStorage:', error);
    }
  }, [selectedCollection, storageKey, isInitialized]);

  // Update collection selection
  const updateCollection = useCallback((collectionId: string) => {
    setSelectedCollection(collectionId);
  }, []);

  // Clear collection selection (revert to default)
  const clearSelection = useCallback(() => {
    setSelectedCollection(defaultCollection);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey);
    }
  }, [defaultCollection, storageKey]);

  return {
    selectedCollection,
    updateCollection,
    clearSelection,
    isInitialized
  };
}

export default useCollectionSelection;
