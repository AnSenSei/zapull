'use client';

import { useState, useEffect, useCallback } from 'react';

interface CardSelectionEntry {
  cardIds: string[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  sessionId: string; // Unique identifier for each session
}

interface UseCardSelectionOptions {
  /**
   * Time to live for card selection in milliseconds
   * Default: 30 minutes (1800000ms)
   */
  ttl?: number;
  
  /**
   * Storage key for session storage
   * Default: 'card_selection'
   */
  storageKey?: string;
  
  /**
   * Whether to clear selection on page refresh
   * Default: true
   */
  clearOnRefresh?: boolean;
}

/**
 * Custom hook for managing card selection with TTL support
 * 
 * This hook provides persistent card selection that:
 * - Stores selection in sessionStorage with TTL
 * - Automatically clears expired selections
 * - Can be configured to clear on page refresh
 * - Maintains type safety
 */
export function useCardSelection(options: UseCardSelectionOptions = {}) {
  const {
    ttl = 30 * 60 * 1000, // 30 minutes default
    storageKey = 'card_selection',
    clearOnRefresh = true
  } = options;

  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load selection from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pageLoadKey = `${storageKey}_page_load`;
    const currentTime = Date.now();
    
    // Check if this is the first load of the page in this session
    const lastPageLoad = sessionStorage.getItem(pageLoadKey);
    const isFirstLoad = !lastPageLoad;
    
    // Mark this page load
    sessionStorage.setItem(pageLoadKey, currentTime.toString());

    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const entry: CardSelectionEntry = JSON.parse(stored);
        const now = Date.now();
        
        // Check if selection has expired
        if (now - entry.timestamp < entry.ttl) {
          // Selection is still valid
          if (!clearOnRefresh || isFirstLoad) {
            setSelectedCards(entry.cardIds);
          } else {
            // Clear on subsequent page loads (refreshes) - remove from storage
            sessionStorage.removeItem(storageKey);
          }
        } else {
          // Selection has expired - remove from storage
          sessionStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.warn('Failed to load card selection from sessionStorage:', error);
      // Clear corrupted data
      sessionStorage.removeItem(storageKey);
    }
    
    setIsInitialized(true);
  }, [storageKey, ttl, clearOnRefresh]);

  // Save selection to sessionStorage whenever it changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;

    try {
      if (selectedCards.length > 0) {
        const entry: CardSelectionEntry = {
          cardIds: selectedCards,
          timestamp: Date.now(),
          ttl,
          sessionId: Math.random().toString(36).substring(2, 15)
        };
        sessionStorage.setItem(storageKey, JSON.stringify(entry));
      } else {
        // Remove from storage if no cards selected
        sessionStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.warn('Failed to save card selection to sessionStorage:', error);
    }
  }, [selectedCards, ttl, storageKey, isInitialized]);

  // Toggle card selection
  const toggleCard = useCallback((cardId: string) => {
    setSelectedCards(prev => 
      prev.includes(cardId)
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
    );
  }, []);

  // Add card to selection
  const addCard = useCallback((cardId: string) => {
    setSelectedCards(prev => 
      prev.includes(cardId) ? prev : [...prev, cardId]
    );
  }, []);

  // Remove card from selection
  const removeCard = useCallback((cardId: string) => {
    setSelectedCards(prev => prev.filter(id => id !== cardId));
  }, []);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedCards([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // Check if card is selected
  const isSelected = useCallback((cardId: string) => {
    return selectedCards.includes(cardId);
  }, [selectedCards]);

  // Get selection count
  const selectionCount = selectedCards.length;

  // Check if selection has expired (useful for UI feedback)
  const isExpired = useCallback(() => {
    if (typeof window === 'undefined') return false;
    
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const entry: CardSelectionEntry = JSON.parse(stored);
        const now = Date.now();
        return now - entry.timestamp >= entry.ttl;
      }
    } catch (error) {
      console.warn('Failed to check selection expiry:', error);
    }
    return false;
  }, [storageKey, ttl]);

  return {
    selectedCards,
    toggleCard,
    addCard,
    removeCard,
    clearSelection,
    isSelected,
    selectionCount,
    isExpired,
    isInitialized
  };
}

export default useCardSelection;
