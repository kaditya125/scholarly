import React, { useEffect, useRef } from 'react';

export function Fireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;
    let isActive = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      alpha: number;
      color: string;
      size: number;
      decay: number;
      drag: number;

      constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        // Faster burst initially for that "crackling" pop
        const speed = Math.random() * 12 + 4; 
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.color = color;
        this.size = Math.random() * 4 + 1.5;
        this.decay = Math.random() * 0.02 + 0.015;
        this.drag = 0.92; // Air resistance
      }

      update() {
        this.vx *= this.drag;
        this.vy *= this.drag;
        this.vy += 0.4; // Gravity
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Google-style bright colors
    const colors = ['#4285F4', '#FBBC04', '#34A853', '#EA4335', '#A142F4', '#24C1E0'];

    const createBurst = (x: number, y: number) => {
      for (let i = 0; i < 80; i++) {
        particles.push(new Particle(x, y, colors[Math.floor(Math.random() * colors.length)]));
      }
    };

    // Series of bursts to feel "congratulating and bursting"
    const bursts = [
      { t: 100, x: 0.2, y: 0.3 },
      { t: 300, x: 0.8, y: 0.25 },
      { t: 600, x: 0.5, y: 0.4 },
      { t: 900, x: 0.3, y: 0.2 },
      { t: 1100, x: 0.7, y: 0.35 },
      { t: 1400, x: 0.4, y: 0.15 },
      { t: 1600, x: 0.6, y: 0.2 }
    ];

    bursts.forEach(b => {
      setTimeout(() => {
        if (!isActive) return;
        createBurst(canvas.width * b.x, canvas.height * b.y);
      }, b.t);
    });

    setTimeout(() => { isActive = false; }, 2000);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles = particles.filter(p => p.alpha > 0);
      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      if (isActive || particles.length > 0) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      isActive = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
