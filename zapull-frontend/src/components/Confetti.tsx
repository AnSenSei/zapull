'use client';

import React, { useEffect, useState } from 'react';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  scale: number;
  velocityX: number;
  velocityY: number;
}

interface ConfettiProps {
  isActive: boolean;
}

export const Confetti: React.FC<ConfettiProps> = ({ isActive }) => {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  
  const colors = ['#FFD700', '#FF69B4', '#00CED1', '#FF6347', '#32CD32', '#FF1493', '#1E90FF', '#FFB6C1'];

  useEffect(() => {
    if (isActive) {
      const newPieces: ConfettiPiece[] = [];
      for (let i = 0; i < 100; i++) {
        newPieces.push({
          id: i,
          x: Math.random() * 100,
          y: -10,
          rotation: Math.random() * 360,
          color: colors[Math.floor(Math.random() * colors.length)],
          scale: 0.5 + Math.random() * 0.5,
          velocityX: (Math.random() - 0.5) * 2,
          velocityY: 2 + Math.random() * 3,
        });
      }
      setPieces(newPieces);

      const interval = setInterval(() => {
        setPieces(prev => prev.map(piece => ({
          ...piece,
          y: piece.y + piece.velocityY,
          x: piece.x + piece.velocityX,
          rotation: piece.rotation + 5,
          velocityY: piece.velocityY + 0.1, // gravity
        })).filter(piece => piece.y < 110));
      }, 50);

      return () => clearInterval(interval);
    } else {
      setPieces([]);
    }
  }, [isActive]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[10000] overflow-hidden">
      {pieces.map(piece => (
        <div
          key={piece.id}
          className="absolute w-3 h-3"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            transform: `rotate(${piece.rotation}deg) scale(${piece.scale})`,
            backgroundColor: piece.color,
            borderRadius: '2px',
          }}
        />
      ))}
    </div>
  );
};