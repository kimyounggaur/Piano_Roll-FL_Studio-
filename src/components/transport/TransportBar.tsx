import React, { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  startPlayback,
  stopPlayback,
} from '../../audio/toneEngine';
import { ticksPerBar } from '../../utils/time';
import type { SnapUnit } from '../../types/music';
import './TransportBar.css';

const SNAP_OPTIONS: SnapUnit[] = ['1/1','1/2','1/4','1/8','1/16','1/32','1/64','1/4T','1/8T','1/16T'];

export const TransportBar: React.FC = () => {
  const {
    project, isPlaying, isLooping, isMetronome, playheadTick,
    updateSettings, setIsPlaying, setIsLooping, setIsMetronome,
    setPlayheadTick, totalTicks,
  } = useProjectStore();
  const { settings } = project;

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    await startPlayback(
      project.tracks,
      settings.bpm,
      settings.ppq,
      playheadTick,
      totalTicks(),
      (tick) => setPlayheadTick(tick),
      () => { setIsPlaying(false); setPlayheadTick(0); },
      isLooping,
      isMetronome,
      settings.timeSignature.numerator,
    );
  }, [isPlaying, isLooping, isMetronome, project, settings, playheadTick, totalTicks, setIsPlaying, setPlayheadTick]);

  const handleStop = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
    setPlayheadTick(0);
  }, [setIsPlaying, setPlayheadTick]);

  const barPos = (() => {
    const tpb = ticksPerBar(settings.ppq, settings.timeSignature);
    const bar = Math.floor(playheadTick / tpb) + 1;
    const beat = Math.floor((playheadTick % tpb) / (settings.ppq * 4 / settings.timeSignature.denominator)) + 1;
    return `${bar}:${beat}`;
  })();

  return (
    <div className="transport-bar">
      <div className="transport-section transport-controls">
        <button
          className={`transport-btn${isPlaying ? ' active' : ''}`}
          onClick={handlePlay}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="transport-btn" onClick={handleStop} title="Stop">
          ⏹
        </button>
        <button
          className={`transport-btn${isLooping ? ' active' : ''}`}
          onClick={() => setIsLooping(!isLooping)}
          title="Loop"
        >
          🔁
        </button>
        <button
          className={`transport-btn${isMetronome ? ' active' : ''}`}
          onClick={() => setIsMetronome(!isMetronome)}
          title="Metronome"
        >
          🥁
        </button>
      </div>

      <div className="transport-section transport-position">
        <span className="position-display">{barPos}</span>
      </div>

      <div className="transport-section">
        <label className="transport-label">BPM</label>
        <input
          type="number"
          className="transport-input bpm-input"
          value={settings.bpm}
          min={20} max={300}
          onChange={(e) => updateSettings({ bpm: Number(e.target.value) })}
        />
      </div>

      <div className="transport-section">
        <label className="transport-label">TIME</label>
        <input
          type="number"
          className="transport-input ts-input"
          value={settings.timeSignature.numerator}
          min={1} max={16}
          onChange={(e) =>
            updateSettings({ timeSignature: { ...settings.timeSignature, numerator: Number(e.target.value) } })
          }
        />
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <select
          className="transport-input ts-input"
          value={settings.timeSignature.denominator}
          onChange={(e) =>
            updateSettings({ timeSignature: { ...settings.timeSignature, denominator: Number(e.target.value) } })
          }
        >
          {[2,4,8,16].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="transport-section">
        <label className="transport-label">BARS</label>
        <input
          type="number"
          className="transport-input"
          value={settings.bars}
          min={1} max={256}
          onChange={(e) => updateSettings({ bars: Number(e.target.value) })}
        />
      </div>

      <div className="transport-section">
        <label className="transport-label">SNAP</label>
        <select
          className="transport-input"
          value={settings.snapUnit}
          onChange={(e) => updateSettings({ snapUnit: e.target.value as SnapUnit })}
        >
          {SNAP_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div className="transport-section transport-project-name">
        <span className="project-name">{project.name}</span>
      </div>
    </div>
  );
};
