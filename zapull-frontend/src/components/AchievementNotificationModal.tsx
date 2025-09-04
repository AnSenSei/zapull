'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { TrophyIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';
import { Confetti } from './Confetti';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  reward: Array<{
    type: string;
    amount?: number;
    emblemId?: string;
    url?: string;
  }>;
}

interface AchievementNotificationModalProps {
  achievements: Achievement[];
  isOpen: boolean;
  onClose: () => void;
}

export const AchievementNotificationModal: React.FC<AchievementNotificationModalProps> = ({
  achievements,
  isOpen,
  onClose,
}) => {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isOpen && achievements.length > 0) {
      setShowConfetti(true);
      // Play a sound effect if available
      const audio = new Audio('/sounds/achievement.mp3');
      audio.play().catch(() => {
        // Ignore if sound fails to play
      });
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [isOpen, achievements.length]);

  const getTotalPoints = () => {
    return achievements.reduce((total, achievement) => {
      const pointRewards = achievement.reward.filter(r => r.type === 'point');
      return total + pointRewards.reduce((sum, r) => sum + (r.amount || 0), 0);
    }, 0);
  };

  const getEmblems = () => {
    const emblems: Array<{ emblemId?: string; url?: string }> = [];
    achievements.forEach(achievement => {
      achievement.reward.forEach(r => {
        if (r.type === 'emblem' && r.url) {
          emblems.push({ emblemId: r.emblemId, url: r.url });
        }
      });
    });
    return emblems;
  };

  return (
    <>
      <Confetti isActive={showConfetti} />
      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog as="div" className="fixed inset-0 z-[9999]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-gray-800 dark:to-gray-900 px-4 pb-4 pt-5 text-left shadow-2xl transition-all w-[90%] max-w-lg sm:my-8 sm:w-full sm:p-6 border-2 border-yellow-300 dark:border-yellow-600">
                <div className="absolute right-2 top-2 sm:right-4 sm:top-4">
                  <button
                    type="button"
                    className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 focus:outline-none p-1"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <Image src="/icons/close.png" alt="Close" width={24} height={24} />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 sm:mx-0 sm:h-16 sm:w-16 animate-bounce">
                    <TrophyIcon className="h-8 w-8 text-white drop-shadow-lg" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left flex-1">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">
                      Achievement Unlocked!
                    </Dialog.Title>
                    
                    <div className="mt-4 space-y-3">
                      {achievements.map((achievement) => (
                        <div key={achievement.id} className="border-l-4 border-yellow-400 pl-4 py-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">{achievement.name}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{achievement.description}</p>
                          
                          <div className="flex items-center gap-4 mt-2">
                            {achievement.reward.map((reward, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                {reward.type === 'point' && (
                                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                    +{reward.amount} Points
                                  </span>
                                )}
                                {reward.type === 'emblem' && reward.url && (
                                  <div className="flex items-center gap-1">
                                    <img src={reward.url} alt="Emblem" className="h-8 w-8 rounded-full border-2 border-yellow-400" />
                                    <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Emblem</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {getTotalPoints() > 0 && (
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-center text-lg font-semibold text-green-700 dark:text-green-400">
                          Total Points Earned: {getTotalPoints()}!
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 sm:mt-4 sm:ml-10 sm:flex sm:pl-6">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:w-auto"
                    onClick={onClose}
                  >
                    Awesome!
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
    </>
  );
};