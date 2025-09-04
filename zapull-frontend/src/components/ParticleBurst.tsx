import React, { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'spark' | 'glow' | 'trail' | 'ring' | 'star' | 'ember' | 'lightning';
  rotation?: number;
  rotationSpeed?: number;
  scale?: number;
  pulsePhase?: number;
  trailLength?: number;
  targetX?: number;
  targetY?: number;
}

interface ParticleBurstProps {
  trigger: boolean;
  color: 'orange' | 'red' | 'purple' | 'blue' | 'green';
  position: { x: number; y: number };
  intensity?: number;
  onComplete?: () => void;
}

const ParticleBurst: React.FC<ParticleBurstProps> = ({ 
  trigger, 
  color, 
  position, 
  intensity = 1,
  onComplete 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);

  const getColorPalette = (colorName: string) => {
    switch (colorName) {
      case 'orange':
        return {
          primary: 'rgba(255, 152, 0, 1)',
          secondary: 'rgba(255, 200, 120, 0.8)',
          glow: 'rgba(255, 170, 51, 0.6)',
          trail: 'rgba(255, 136, 0, 0.4)'
        };
      case 'red':
        return {
          primary: 'rgba(255, 71, 87, 1)',
          secondary: 'rgba(255, 140, 150, 0.8)',
          glow: 'rgba(255, 120, 130, 0.6)',
          trail: 'rgba(255, 71, 87, 0.4)'
        };
      case 'purple':
        return {
          primary: 'rgba(156, 39, 176, 1)',
          secondary: 'rgba(186, 104, 200, 0.8)',
          glow: 'rgba(171, 71, 188, 0.6)',
          trail: 'rgba(142, 36, 170, 0.4)'
        };
      case 'blue':
        return {
          primary: 'rgba(33, 150, 243, 1)',
          secondary: 'rgba(100, 181, 246, 0.8)',
          glow: 'rgba(66, 165, 245, 0.6)',
          trail: 'rgba(30, 136, 229, 0.4)'
        };
      default:
        return {
          primary: 'rgba(76, 175, 80, 1)',
          secondary: 'rgba(129, 199, 132, 0.8)',
          glow: 'rgba(102, 187, 106, 0.6)',
          trail: 'rgba(67, 160, 71, 0.4)'
        };
    }
  };

  const createParticles = useCallback(() => {
    const particles: Particle[] = [];
    const palette = getColorPalette(color);
    const particleCount = Math.floor(50 * intensity); // More particles!
    
    // STAGE 1: Shockwave rings - expanding outward
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: position.x,
        y: position.y,
        vx: 0,
        vy: 0,
        life: 1,
        maxLife: 0.6 + i * 0.2,
        size: 20 + i * 30,
        color: palette.primary,
        type: 'ring',
        scale: 0.1,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 0.1
      });
    }
    
    // STAGE 2: Lightning bolts - electric effect
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const distance = 100 + Math.random() * 50;
      particles.push({
        x: position.x,
        y: position.y,
        vx: 0,
        vy: 0,
        life: 1,
        maxLife: 0.3 + Math.random() * 0.2,
        size: 2,
        color: 'rgba(255, 255, 255, 0.9)',
        type: 'lightning',
        targetX: position.x + Math.cos(angle) * distance,
        targetY: position.y + Math.sin(angle) * distance,
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
    
    // STAGE 3: Explosive sparks - fast moving, bright
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 15 + Math.random() * 20 * intensity; // Faster!
      const sparkColor = Math.random() > 0.7 ? 'rgba(255, 255, 255, 1)' : 
                        Math.random() > 0.4 ? palette.primary : palette.secondary;
      particles.push({
        x: position.x,
        y: position.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 5,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 1 + Math.random() * 4,
        color: sparkColor,
        type: 'spark',
        trailLength: 5 + Math.random() * 10
      });
    }

    // STAGE 4: Star particles - rotating, glowing
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = 6 + Math.random() * 8 * intensity;
      particles.push({
        x: position.x,
        y: position.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.8 + Math.random() * 0.4,
        size: 8 + Math.random() * 12,
        color: palette.glow,
        type: 'star',
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        pulsePhase: Math.random() * Math.PI * 2
      });
    }

    // STAGE 5: Ember particles - floating upward with glow
    for (let i = 0; i < particleCount / 2; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const offsetY = (Math.random() - 0.5) * 40;
      particles.push({
        x: position.x + offsetX,
        y: position.y + offsetY,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 4 - 2, // Float upward
        life: 1,
        maxLife: 1.5 + Math.random() * 0.5,
        size: 3 + Math.random() * 5,
        color: palette.trail,
        type: 'ember',
        pulsePhase: Math.random() * Math.PI * 2
      });
    }

    // STAGE 6: Large glow explosion - central burst
    particles.push({
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 0.4,
      size: 150,
      color: palette.secondary,
      type: 'glow',
      scale: 0.1
    });

    return particles;
  }, [color, position, intensity]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Add screen shake effect for first 200ms
    const shakeIntensity = particlesRef.current.some(p => p.life > 0.8) ? 3 : 0;
    if (shakeIntensity > 0) {
      ctx.save();
      ctx.translate(
        (Math.random() - 0.5) * shakeIntensity,
        (Math.random() - 0.5) * shakeIntensity
      );
    }

    // Update and draw particles
    let activeParticles = 0;
    particlesRef.current = particlesRef.current.filter(particle => {
      // Update particle physics
      particle.life -= 0.025;
      
      // Skip dead particles
      if (particle.life <= 0) return false;

      const opacity = particle.life / particle.maxLife;
      
      // Update position based on type
      if (particle.type !== 'ring' && particle.type !== 'lightning') {
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // Apply different physics based on type
        if (particle.type === 'spark') {
          particle.vy += 0.5;
          particle.vx *= 0.97;
          particle.vy *= 0.97;
        } else if (particle.type === 'ember') {
          particle.vy += -0.1; // Float up
          particle.vx *= 0.99;
          particle.vx += (Math.random() - 0.5) * 0.2; // Wavering motion
        } else if (particle.type === 'star') {
          particle.vy += 0.3;
          particle.vx *= 0.98;
          particle.vy *= 0.98;
          particle.rotation! += particle.rotationSpeed!;
        } else {
          particle.vy += 0.3;
          particle.vx *= 0.98;
          particle.vy *= 0.98;
        }
      }

      // Draw particle based on type
      if (particle.type === 'ring') {
        // Expanding shockwave rings
        ctx.save();
        const scale = particle.scale! + (1 - particle.scale!) * (1 - opacity);
        const ringSize = Math.max(0, particle.size * scale); // Prevent negative radius
        ctx.globalAlpha = opacity * 0.5;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = Math.max(0.5, 3 - (2 * (1 - opacity))); // Prevent negative line width
        ctx.shadowBlur = 20;
        ctx.shadowColor = particle.color;
        
        if (ringSize > 0) { // Only draw if radius is positive
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, ringSize, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        particle.scale = scale;
        ctx.restore();
        
      } else if (particle.type === 'lightning') {
        // Electric bolts
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(100, 200, 255, 1)';
        
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        
        // Create jagged lightning path
        const segments = 5;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const baseX = particle.x + (particle.targetX! - particle.x) * t;
          const baseY = particle.y + (particle.targetY! - particle.y) * t;
          const offsetX = (Math.random() - 0.5) * 20 * (1 - t);
          const offsetY = (Math.random() - 0.5) * 20 * (1 - t);
          ctx.lineTo(baseX + offsetX, baseY + offsetY);
        }
        
        ctx.stroke();
        ctx.restore();
        
      } else if (particle.type === 'star') {
        // Rotating star particles
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation!);
        ctx.globalAlpha = opacity;
        
        const pulse = 1 + Math.sin(particle.pulsePhase! + Date.now() * 0.005) * 0.2;
        const starSize = Math.max(1, particle.size * pulse); // Ensure positive size
        
        // Draw star shape
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const outerX = Math.cos(angle) * starSize;
          const outerY = Math.sin(angle) * starSize;
          const innerAngle = angle + Math.PI / 5;
          const innerX = Math.cos(innerAngle) * starSize * 0.5;
          const innerY = Math.sin(innerAngle) * starSize * 0.5;
          
          if (i === 0) {
            ctx.moveTo(outerX, outerY);
          } else {
            ctx.lineTo(outerX, outerY);
          }
          ctx.lineTo(innerX, innerY);
        }
        ctx.closePath();
        ctx.fill();
        
        // Add bright core
        ctx.globalAlpha = opacity * 0.9;
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.beginPath();
        ctx.arc(0, 0, starSize * 0.2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
      } else if (particle.type === 'ember') {
        // Glowing embers with pulsing
        ctx.save();
        const pulse = 1 + Math.sin(particle.pulsePhase! + Date.now() * 0.003) * 0.3;
        const emberSize = Math.max(1, particle.size * pulse); // Ensure positive size
        ctx.globalAlpha = opacity * 0.8;
        
        // Outer glow
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, emberSize * 2
        );
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(0.4, particle.color.replace(/[\d.]+\)$/, '0.5)'));
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(
          particle.x - emberSize * 2,
          particle.y - emberSize * 2,
          emberSize * 4,
          emberSize * 4
        );
        
        // Inner core
        ctx.globalAlpha = opacity;
        ctx.fillStyle = 'rgba(255, 200, 100, 1)';
        ctx.shadowBlur = 10;
        ctx.shadowColor = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, Math.max(0.5, emberSize * 0.5), 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
      } else if (particle.type === 'glow') {
        // Large central explosion glow
        ctx.save();
        const scale = particle.scale || 1;
        const expandedScale = Math.max(0.1, scale + (1 - opacity) * 2); // Ensure positive scale
        particle.scale = expandedScale;
        
        const glowSize = Math.max(1, particle.size * expandedScale); // Ensure positive size
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, glowSize
        );
        const color = particle.color.replace(/[\d.]+\)$/, `${opacity * 0.8})`);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.3, color.replace(/[\d.]+\)$/, `${opacity * 0.4})`));
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(
          particle.x - glowSize,
          particle.y - glowSize,
          glowSize * 2,
          glowSize * 2
        );
        ctx.restore();
        
      } else if (particle.type === 'spark') {
        // Fast-moving sparks with trails
        ctx.save();
        ctx.globalAlpha = opacity;
        
        // Draw trail
        if (particle.trailLength) {
          const gradient = ctx.createLinearGradient(
            particle.x - particle.vx * 2,
            particle.y - particle.vy * 2,
            particle.x,
            particle.y
          );
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(1, particle.color);
          
          ctx.strokeStyle = gradient;
          ctx.lineWidth = particle.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(
            particle.x - particle.vx * particle.trailLength! * 0.1,
            particle.y - particle.vy * particle.trailLength! * 0.1
          );
          ctx.lineTo(particle.x, particle.y);
          ctx.stroke();
        }
        
        // Draw spark head
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Add bright core
        ctx.globalAlpha = opacity * 0.9;
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
      } else {
        // Default trail particles
        ctx.save();
        ctx.globalAlpha = opacity * 0.7;
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.ellipse(
          particle.x, 
          particle.y, 
          particle.size * 0.5, 
          particle.size * 2,
          Math.atan2(particle.vy, particle.vx),
          0, 
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }

      activeParticles++;
      return true;
    });

    // Restore canvas state if shake was applied
    if (shakeIntensity > 0) {
      ctx.restore();
    }

    // Continue animation if particles exist
    if (activeParticles > 0) {
      animationRef.current = requestAnimationFrame(animate);
    } else if (onComplete) {
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    if (trigger && canvasRef.current) {
      // Set canvas size using consistent viewport reference
      const canvas = canvasRef.current;
      // Use visualViewport if available (modern mobile browsers), fallback to window dimensions
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      
      canvas.width = viewportWidth;
      canvas.height = viewportHeight;

      // Create new particles
      particlesRef.current = createParticles();
      
      // Start animation
      animate();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [trigger, createParticles, animate]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
};

export default ParticleBurst;