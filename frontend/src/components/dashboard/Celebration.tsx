import React, { useEffect, useRef } from 'react';

export function Celebration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isActive = true;
    const startTime = performance.now();

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const GOLD_COLORS = ['#FFD700', '#FFC83D', '#F4C430', '#E6B422', '#D4AF37', '#FFF1B0'];
    const getRandomGold = () => GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)];

    class Confetti {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      color: string;
      colorDark: string;
      rotation: number;
      rotationSpeed: number;
      type: 'rect' | 'square' | 'strip' | 'diamond';
      opacity: number;
      oscillationSpeed: number;
      oscillationAngle: number;

      constructor(startY?: number) {
        this.x = Math.random() * canvas.width;
        this.y = startY ?? -20;
        this.size = Math.random() * 10 + 4; // 4 - 14px
        this.speedY = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 2;
        this.color = getRandomGold();
        this.colorDark = '#B8860B'; // Dark goldenrod for the flip side
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        const types = ['rect', 'square', 'strip', 'diamond'] as const;
        this.type = types[Math.floor(Math.random() * types.length)];
        this.opacity = Math.random() * 0.4 + 0.6;
        this.oscillationSpeed = Math.random() * 0.05 + 0.02;
        this.oscillationAngle = Math.random() * Math.PI * 2;
      }

      update() {
        this.y += this.speedY;
        this.oscillationAngle += this.oscillationSpeed;
        this.x += Math.sin(this.oscillationAngle) * 1.5 + this.speedX;
        this.rotation += this.rotationSpeed;
      }

      draw(ctx: CanvasRenderingContext2D, globalFade: number) {
        ctx.save();
        ctx.globalAlpha = this.opacity * globalFade;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Simulating 3D flip by scaling based on sine of rotation
        const flip = Math.sin(this.oscillationAngle * 2);
        ctx.scale(1, Math.abs(flip) + 0.1);

        // Metallic effect: color changes depending on the flip side
        ctx.fillStyle = flip > 0 ? this.color : this.colorDark;
        
        if (this.type === 'square') {
          ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        } else if (this.type === 'rect') {
          ctx.fillRect(-this.size, -this.size/2, this.size * 2, this.size);
        } else if (this.type === 'strip') {
          ctx.fillRect(-this.size/4, -this.size, this.size/2, this.size * 2);
        } else if (this.type === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(0, -this.size);
          ctx.lineTo(this.size/2, 0);
          ctx.lineTo(0, this.size);
          ctx.lineTo(-this.size/2, 0);
          ctx.fill();
        }
        
        ctx.restore();
      }
    }

    class Ribbon {
      x: number;
      y: number;
      length: number;
      thickness: number;
      color: string;
      speedY: number;
      speedX: number;
      waveOffset: number;
      waveSpeed: number;
      opacity: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = -Math.random() * 200 - 50;
        this.length = Math.random() * 150 + 100;
        this.thickness = Math.random() * 4 + 3;
        this.color = getRandomGold();
        this.speedY = Math.random() * 1.5 + 1; // Slower than confetti
        this.speedX = (Math.random() - 0.5);
        this.waveOffset = Math.random() * Math.PI * 2;
        this.waveSpeed = Math.random() * 0.03 + 0.01;
        this.opacity = Math.random() * 0.4 + 0.6;
      }

      update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.waveOffset += this.waveSpeed;
      }

      draw(ctx: CanvasRenderingContext2D, globalFade: number) {
        ctx.save();
        ctx.globalAlpha = this.opacity * globalFade;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        for (let i = 0; i < this.length; i += 10) {
          const waveX = Math.sin(this.waveOffset + i * 0.05) * 25;
          if (i === 0) {
            ctx.moveTo(this.x + waveX, this.y - i);
          } else {
            ctx.lineTo(this.x + waveX, this.y - i);
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    class Sparkle {
      x: number;
      y: number;
      size: number;
      color: string;
      phase: number;
      phaseSpeed: number;
      life: number;
      maxLife: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 14 + 4; // 4 - 18px
        this.color = Math.random() > 0.5 ? '#FFF1B0' : '#FFFFFF'; // Golden-white
        this.phase = Math.random() * Math.PI * 2;
        this.phaseSpeed = Math.random() * 0.05 + 0.02;
        this.life = 0;
        this.maxLife = Math.random() * 80 + 40;
      }

      update() {
        this.phase += this.phaseSpeed;
        this.life++;
      }

      draw(ctx: CanvasRenderingContext2D, globalFade: number) {
        const fade = Math.sin((this.life / this.maxLife) * Math.PI);
        if (fade <= 0) return;
        
        const currentSize = this.size * (0.5 + 0.5 * Math.abs(Math.sin(this.phase)));

        ctx.save();
        // Glow intensity: opacity 0.5 - 1.0
        ctx.globalAlpha = (0.5 + fade * 0.5) * globalFade;
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        
        ctx.shadowBlur = 6;
        ctx.shadowColor = this.color;
        
        // Draw 4-point star
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.lineTo(0, -currentSize);
          ctx.lineTo(currentSize * 0.15, -currentSize * 0.15);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    class Glitter {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      color: string;
      phase: number;
      phaseSpeed: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.5 + 0.5;
        this.speedY = Math.random() * 0.4 - 0.1;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.color = getRandomGold();
        this.phase = Math.random() * Math.PI * 2;
        this.phaseSpeed = Math.random() * 0.03 + 0.01;
      }

      update() {
        this.y += this.speedY;
        this.x += this.speedX;
        // Slight curve
        this.x += Math.sin(this.phase) * 0.2;
        this.phase += this.phaseSpeed;
        
        // Wrap around vertically if it drifts too far
        if (this.y > canvas.height + 10) this.y = -10;
        if (this.y < -10) this.y = canvas.height + 10;
      }

      draw(ctx: CanvasRenderingContext2D, globalFade: number) {
        ctx.save();
        // Twinkle
        ctx.globalAlpha = (0.2 + 0.8 * Math.abs(Math.sin(this.phase))) * globalFade;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    let confettis: Confetti[] = [];
    let ribbons: Ribbon[] = [];
    let sparkles: Sparkle[] = [];
    let glitters: Glitter[] = [];

    // Pre-populate background glitter and initial sparkles
    for (let i = 0; i < 150; i++) glitters.push(new Glitter());
    for (let i = 0; i < 40; i++) sparkles.push(new Sparkle());

    // Pre-populate some confetti so it doesn't start completely empty
    for (let i = 0; i < 100; i++) confettis.push(new Confetti(Math.random() * canvas.height * 0.5));

    const render = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let globalFade = 1;
      if (elapsed > 4) {
        globalFade = Math.max(0, 1 - (elapsed - 4));
      }

      // Spawning logic (0 - 2.5s)
      if (elapsed < 2.5) {
        // Spawn confetti
        for (let i = 0; i < 6; i++) {
          confettis.push(new Confetti());
        }
        // Spawn ribbons (keep up to 15)
        if (ribbons.length < 15 && Math.random() < 0.1) {
          ribbons.push(new Ribbon());
        }
      }

      // Layer 1: Background Glitter
      glitters.forEach(g => {
        g.update();
        g.draw(ctx, globalFade);
      });

      // Layer 2: Confetti
      confettis = confettis.filter(c => c.y < canvas.height + 50);
      confettis.forEach(c => {
        c.update();
        c.draw(ctx, globalFade);
      });

      // Layer 3: Ribbons
      ribbons = ribbons.filter(r => (r.y - r.length) < canvas.height + 50);
      ribbons.forEach(r => {
        r.update();
        r.draw(ctx, globalFade);
      });

      // Layer 4: Sparkles
      sparkles.forEach((s, i) => {
        s.update();
        s.draw(ctx, globalFade);
        if (s.life >= s.maxLife && elapsed < 4) {
          sparkles[i] = new Sparkle(); // Respawn
        }
      });

      if (elapsed >= 5) {
        isActive = false;
      }

      if (isActive) {
        animationFrameId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" style={{ opacity: 0.85 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  );
}
