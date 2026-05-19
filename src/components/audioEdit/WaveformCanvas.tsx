import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks?: Float32Array;
  gain: number;
  muted: boolean;
  width: number;
  height: number;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({ peaks, gain, muted, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length < 2) {
      ctx.font      = '10px sans-serif';
      ctx.fillStyle = 'rgba(180,180,180,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('파형 없음', width / 2, height / 2 + 4);
      return;
    }

    const color = muted
      ? 'rgba(159,232,112,0.3)'
      : 'rgba(159,232,112,0.75)';

    const midY   = height / 2;
    const ampMax = midY * 0.9;
    const step   = width / (peaks.length / 2);

    ctx.fillStyle = color;
    for (let i = 0; i < peaks.length - 1; i += 2) {
      const peakMax =  peaks[i]     * gain;
      const peakMin =  peaks[i + 1] * gain;
      const x       = (i / 2) * step;
      const yTop    = midY - Math.min(Math.abs(peakMax), 1) * ampMax;
      const yBot    = midY + Math.min(Math.abs(peakMin), 1) * ampMax;
      const barH    = Math.max(1, yBot - yTop);
      ctx.fillRect(Math.floor(x), Math.floor(yTop), Math.max(1, Math.ceil(step)), Math.ceil(barH));
    }
  }, [peaks, gain, muted, width, height]);

  return <canvas ref={canvasRef} style={{ display: 'block', width, height }} />;
};
