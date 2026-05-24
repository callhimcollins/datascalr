"use client";

import { useEffect, useRef } from "react";
import type { Particle } from "@/lib/particles";
import { createParticles, updateParticle, drawDotGrid, drawParticles } from "@/lib/particles";

interface MouseState {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
}

export function useBgCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isDark: boolean,
) {
  const mouseRef = useRef<MouseState>({
    x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    const mouse = mouseRef.current;

    function onMouseMove(e: MouseEvent) {
      mouse.px = mouse.x;
      mouse.py = mouse.y;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.vx = mouse.x - mouse.px;
      mouse.vy = mouse.y - mouse.py;
    }

    function onMouseLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.px = -9999;
      mouse.py = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      const count = Math.min(180, Math.floor((canvas!.width * canvas!.height) / 10000));
      particles = createParticles(count, canvas!.width, canvas!.height);
    }

    let frame = 0;

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      drawDotGrid(ctx!, canvas!.width, canvas!.height, isDark);

      for (const p of particles) {
        updateParticle(p, mouse, frame, canvas!.width, canvas!.height);
      }
      drawParticles(ctx!, particles, isDark);

      frame++;
      animId = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [canvasRef, isDark]);
}
