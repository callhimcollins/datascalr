"use client";

import { useRef } from "react";
import { useTheme } from "@/lib/theme";
import { useBgCanvas } from "@/lib/useBgCanvas";

export function BgCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolved } = useTheme();

  useBgCanvas(canvasRef, resolved === "dark");

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
