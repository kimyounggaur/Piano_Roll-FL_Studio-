import React, { useRef, useState, useEffect } from 'react';
import { PianoKeyboard } from './PianoKeyboard';
import { PianoRollCanvas } from './PianoRollCanvas';
import { VelocityLane } from './VelocityLane';
import { ToolBar } from './ToolBar';
import { useProjectStore } from '../../store/projectStore';
import './PianoRoll.css';

const KEYBOARD_WIDTH = 72;
const VELOCITY_HEIGHT = 100;
const MIN_ROLL_HEIGHT = 200;

export const PianoRoll: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 500 });
  const { deleteSelected, clearSelection } = useProjectStore();

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDims({ width, height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
      if (e.key === 'Escape') { clearSelection(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, clearSelection]);

  const rollHeight = Math.max(MIN_ROLL_HEIGHT, dims.height - VELOCITY_HEIGHT);
  const canvasWidth = Math.max(1, dims.width - KEYBOARD_WIDTH);

  return (
    <div className="piano-roll-wrapper">
      <ToolBar />
      <div className="piano-roll-body" ref={containerRef}>
        <div className="piano-roll-main" style={{ height: rollHeight }}>
          <PianoKeyboard height={rollHeight} />
          <div className="piano-roll-canvas-wrapper">
            <PianoRollCanvas width={canvasWidth} height={rollHeight} />
          </div>
        </div>
        <div className="velocity-lane-wrapper">
          <div style={{ width: KEYBOARD_WIDTH, flexShrink: 0, background: '#0e0e1c', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', writingMode: 'vertical-rl', letterSpacing: '0.1em' }}>VEL</span>
          </div>
          <VelocityLane width={canvasWidth} height={VELOCITY_HEIGHT} />
        </div>
      </div>
    </div>
  );
};
