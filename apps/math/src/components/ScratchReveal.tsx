"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Touch + mouse "scratch card": children are hidden under a gift-wrap canvas
// the kid scratches away with a finger. Reveals fully once ~half is scratched,
// or immediately when `forceReveal` flips true (the "Reveal" button).
export default function ScratchReveal({
  size = 240,
  onReveal,
  forceReveal = false,
  children,
}: {
  size?: number;
  onReveal?: () => void;
  forceReveal?: boolean;
  children: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [revealed, setRevealed] = useState(false);

  // Paint the gift-wrap cover once.
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "#a78bfa");
    g.addColorStop(1, "#f0abfc");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // ribbon cross
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(size / 2 - 10, 0, 20, size);
    ctx.fillRect(0, size / 2 - 10, size, 20);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "48px serif";
    ctx.fillText("🎁", size / 2, size / 2 - 12);
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillText("Scratch me!", size / 2, size / 2 + 28);
  }, [size]);

  const finishReveal = useCallback(() => {
    setRevealed((r) => {
      if (!r) onReveal?.();
      return true;
    });
  }, [onReveal]);

  useEffect(() => {
    if (forceReveal) finishReveal();
  }, [forceReveal, finishReveal]);

  const scratchAt = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const r = cv.getBoundingClientRect();
    const x = (clientX - r.left) * (size / r.width);
    const y = (clientY - r.top) * (size / r.height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
  };

  const checkCleared = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const { data } = ctx.getImageData(0, 0, size, size);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 64) {
      total++;
      if (data[i] === 0) clear++;
    }
    if (clear / total > 0.5) finishReveal();
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0">{children}</div>
      {!revealed && (
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="absolute inset-0 h-full w-full cursor-grab touch-none"
          onPointerDown={(e) => {
            drawing.current = true;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            scratchAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (drawing.current) scratchAt(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            drawing.current = false;
            checkCleared();
          }}
        />
      )}
    </div>
  );
}
