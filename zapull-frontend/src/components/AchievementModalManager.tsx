'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AchievementNotificationModal, Achievement } from './AchievementNotificationModal';
import { setAchievementModalCallback } from '@/lib/achievementChecker';

/**
 * Global achievement modal manager
 * This component should be added to the root layout to handle achievement notifications
 */
export const AchievementModalManager: React.FC = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Set the callback to show achievements
    setAchievementModalCallback((newAchievements) => {
      setAchievements(newAchievements);
      setIsOpen(true);
    });

    // Cleanup
    return () => {
      setAchievementModalCallback(null);
      setMounted(false);
    };
  }, []);

  // Lock background scroll when modal is open (especially important on mobile)
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    if (isOpen) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
    } else {
      html.style.overflow = prevHtmlOverflow || '';
      body.style.overflow = prevBodyOverflow || '';
    }

    return () => {
      html.style.overflow = prevHtmlOverflow || '';
      body.style.overflow = prevBodyOverflow || '';
    };
  }, [isOpen, mounted]);

  const handleClose = () => {
    setIsOpen(false);
    // Clear achievements after animation
    setTimeout(() => setAchievements([]), 300);
  };

  // Use portal to render modal at document body level
  if (!mounted) return null;
  
  return createPortal(
    <AchievementNotificationModal
      achievements={achievements}
      isOpen={isOpen}
      onClose={handleClose}
    />,
    document.body
  );
};
