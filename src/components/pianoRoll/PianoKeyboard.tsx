import React, { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { isBlackKey } from '../../utils/musicTheory';
import { isInScale } from '../../utils/musicTheory';
import * as Tone from 'tone';

const TOTAL_KEYS = 128;
const KEYBOARD_WIDTH = 72;

interface Props {
  height: number;
}

export const PianoKeyboard: React.FC<Props> = ({ height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport, project } = useProjectStore();
  const { keyHeight, scrollY } = viewport;
  const { settings } = project;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = KEYBOARD_WIDTH * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${KEYBOARD_WIDTH}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Wise near-black keyboard background
    ctx.fillStyle = '#0e0f0c';
    ctx.fillRect(0, 0, KEYBOARD_WIDTH, height);

    const firstVisible = Math.floor(scrollY / keyHeight);
    const lastVisible = Math.min(TOTAL_KEYS - 1, Math.ceil((scrollY + height) / keyHeight));

    for (let i = firstVisible; i <= lastVisible; i++) {
      const pitch = TOTAL_KEYS - 1 - i;
      const y = i * keyHeight - scrollY;
      const black = isBlackKey(pitch);
      const inScale = isInScale(pitch, settings.scaleRoot, settings.scaleName);
      const scaleActive = settings.scaleName !== 'none';

      if (black) {
        // Wise near-black for black keys
        ctx.fillStyle = '#0e0f0c';
        ctx.fillRect(0, y, KEYBOARD_WIDTH * 0.62, keyHeight - 1);
        // Slightly lighter right edge for depth
        ctx.fillStyle = '#1e2018';
        ctx.fillRect(KEYBOARD_WIDTH * 0.62, y, KEYBOARD_WIDTH * 0.38, keyHeight - 1);
      } else {
        // In-scale keys get Wise Light Mint tint; others are Wise Light Surface
        ctx.fillStyle = scaleActive && inScale ? '#d4f0b5' : '#e8ebe6';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, keyHeight - 1);
        // Subtle inner shadow on white keys
        ctx.fillStyle = 'rgba(14,15,12,0.05)';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, 1);
      }

      // Wise Green tint for in-scale black keys
      if (black && scaleActive && inScale) {
        ctx.fillStyle = 'rgba(159,232,112,0.18)';
        ctx.fillRect(0, y, KEYBOARD_WIDTH * 0.62, keyHeight - 1);
      }

      // C label — Wise Dark Green on white key, accent on black
      if (pitch % 12 === 0) {
        ctx.fillStyle = black ? '#9fe870' : '#163300';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`C${Math.floor(pitch / 12) - 1}`, KEYBOARD_WIDTH - 4, y + keyHeight - 3);
      }

      // Thin separator — Wise ring-shadow style
      ctx.fillStyle = 'rgba(14,15,12,0.25)';
      ctx.fillRect(0, y + keyHeight - 1, KEYBOARD_WIDTH, 1);
    }
  }, [height, keyHeight, scrollY, settings.scaleRoot, settings.scaleName]);

  useEffect(() => { draw(); }, [draw]);

  const playNote = useCallback((pitch: number) => {
    Tone.start().then(() => {
      const synth = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.5 },
      }).toDestination();
      const freq = Tone.Frequency(pitch, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, '8n');
      setTimeout(() => synth.dispose(), 1000);
    });
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const noteIndex = Math.floor((y + scrollY) / keyHeight);
    const pitch = TOTAL_KEYS - 1 - noteIndex;
    if (pitch >= 0 && pitch < 128) playNote(pitch);
  }, [scrollY, keyHeight, playNote]);

  return (
    <canvas
      ref={canvasRef}
      style={{ cursor: 'pointer', flexShrink: 0 }}
      onClick={handleClick}
    />
  );
};
