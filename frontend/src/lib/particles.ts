export interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  alpha: number;
  phase: number;
  vx: number;
  vy: number;
}

export function createParticle(cw: number, ch: number): Particle {
  return {
    x: Math.random() * cw,
    y: Math.random() * ch,
    size: 0.8 + Math.random() * 1.2,
    speed: 0.08 + Math.random() * 0.35,
    drift: (Math.random() - 0.5) * 0.2,
    alpha: 0.35 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2,
    vx: 0,
    vy: 0,
  };
}

export function createParticles(count: number, cw: number, ch: number): Particle[] {
  return Array.from({ length: count }, () => createParticle(cw, ch));
}

export function updateParticle(p: Particle, mouse: {
  x: number; y: number;
  vx: number; vy: number;
}, frame: number, cw: number, ch: number) {
  p.vx *= 0.92;
  p.vy *= 0.92;

  p.vy -= p.speed * 0.05;
  p.vx += Math.sin(frame * 0.005 + p.phase) * p.drift * 0.05;

  const dx = p.x - mouse.x;
  const dy = p.y - mouse.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 60) {
    const strength = 1 - dist / 60;
    p.vx += mouse.vx * strength * 0.6;
    p.vy += mouse.vy * strength * 0.6;

    if (dist > 1) {
      const pushStr = (1 - dist / 60) * 0.5;
      p.vx += (dx / dist) * pushStr;
      p.vy += (dy / dist) * pushStr;
    }
  }

  p.x += p.vx;
  p.y += p.vy;

  if (p.y < -10 || p.x < -50 || p.x > cw + 50) {
    p.y = ch + 10;
    p.x = Math.random() * cw;
    p.alpha = 0.35 + Math.random() * 0.4;
    p.vx = 0;
    p.vy = 0;
  }
}

export function drawDotGrid(ctx: CanvasRenderingContext2D, cw: number, ch: number, isDark: boolean) {
  const spacing = 36;
  ctx.fillStyle = isDark
    ? `rgba(255, 255, 255, ${0.035})`
    : `rgba(0, 0, 0, ${0.04})`;

  for (let x = 0; x < cw; x += spacing) {
    for (let y = 0; y < ch; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], isDark: boolean) {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = isDark
      ? `rgba(255, 255, 255, ${Math.min(p.alpha * 0.8, 1)})`
      : `rgba(204, 93, 15, ${Math.min(p.alpha * 1.3, 1)})`;
    ctx.fill();
  }
}
