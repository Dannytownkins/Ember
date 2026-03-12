"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  life: number;
  maxLife: number;
}

export function EmberParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const createParticle = (): Particle => {
      const maxLife = 120 + Math.random() * 180; // 2-5 seconds at 60fps
      return {
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        size: 1 + Math.random() * 3,
        speedY: -(0.3 + Math.random() * 0.8),
        speedX: (Math.random() - 0.5) * 0.4,
        opacity: 0.3 + Math.random() * 0.5,
        life: 0,
        maxLife,
      };
    };

    // Initialize with some particles
    for (let i = 0; i < 15; i++) {
      const particle = createParticle();
      particle.y = Math.random() * canvas.height;
      particle.life = Math.random() * particle.maxLife;
      particlesRef.current.push(particle);
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Add new particles occasionally
      if (Math.random() < 0.08 && particlesRef.current.length < 30) {
        particlesRef.current.push(createParticle());
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        particle.life++;

        // Gentle drift
        particle.speedX += (Math.random() - 0.5) * 0.02;

        // Fade based on life
        const lifeRatio = particle.life / particle.maxLife;
        const alpha = particle.opacity * (1 - lifeRatio);

        if (alpha <= 0 || particle.y < -10) {
          return false;
        }

        // Draw ember glow
        const gradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.size * 3
        );
        gradient.addColorStop(0, `rgba(251, 191, 36, ${alpha})`);
        gradient.addColorStop(0.4, `rgba(245, 158, 11, ${alpha * 0.6})`);
        gradient.addColorStop(1, "transparent");

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(254, 243, 199, ${alpha})`;
        ctx.fill();

        return true;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 0.7 }}
    />
  );
}
