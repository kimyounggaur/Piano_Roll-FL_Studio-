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

    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, KEYBOARD_WIDTH, height);

    const firstVisible = Math.floor(scrollY / keyHeight);
    const lastVisible = Math.min(TOTAL_KEYS - 1, Math.ceil((scrollY + height) / keyHeight));

    for (let i = firstVisible; i <= lastVisible; i++) {
      const pitch = TOTAL_KEYS - 1 - i;
      const y = i * keyHeight - scrollY;
      const black = isBlackKey(pitch);
      const inScale = isInScale(pitch, settings.scaleRoot, settings.scaleName);

      if (black) {
        ctx.fillStyle = '#111122';
        ctx.fillRect(0, y, KEYBOARD_WIDTH * 0.62, keyHeight - 1);
        ctx.fillStyle = '#333355';
        ctx.fillRect(KEYBOARD_WIDTH * 0.62, y, KEYBOARD_WIDTH * 0.38, keyHeight - 1);
      } else {
        ctx.fillStyle = inScale && settings.scaleName !== 'none' ? '#c8d8f8' : '#dde4f0';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, keyHeight - 1);
      }

      // Octave C label
      if (pitch % 12 === 0) {
        ctx.fillStyle = '#555577';
        ctx.font = `bold 9px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`C${Math.floor(pitch / 12) - 1}`, KEYBOARD_WIDTH - 3, y + keyHeight - 3);
      }

      // Thin separator
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
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
