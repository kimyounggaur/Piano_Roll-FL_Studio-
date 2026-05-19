import React, { useCallback, useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  initAudio,
  playProject,
  pauseProject,
  stopProject,
  setBpm as setEngineBpm,
} from '../../audio/toneEngine';
import { formatTickFull } from '../../utils/time';
import type { SnapUnit } from '../../types/music';
import {
  applyThemeMode,
  getNextThemeMode,
  readStoredThemeMode,
  writeStoredThemeMode,
  type ThemeMode,
} from '../../themeMode';
import './TransportBar.css';

const SNAP_OPTIONS: SnapUnit[] = [
  '1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64',
  '1/4T', '1/8T', '1/16T', '1/32T', '1/64T',
];

export const TransportBar: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const {
    project, isPlaying, isLooping, isMetronome, playheadTick,
    updateSettings, setIsPlaying, setIsLooping, setIsMetronome,
    setPlayheadTick, totalTicks,
  } = useProjectStore();
  const { settings } = project;

  useEffect(() => {
    applyThemeMode(themeMode);
    writeStoredThemeMode(themeMode);
  }, [themeMode]);

  const handlePlay = useCallback(async () => {
    // First gesture — unblock browser autoplay before any audio call
    await initAudio();
    if (isPlaying) return; // already playing — no-op (use Pause / Stop)
    setIsPlaying(true);
    await playProject(project, {
      startTick:  playheadTick,
      totalTicks: totalTicks(),
      loop:       isLooping,
      metronome:  isMetronome,
      onTick:     (tick) => setPlayheadTick(tick),
      onStop:     () => { setIsPlaying(false); setPlayheadTick(0); },
    });
  }, [isPlaying, isLooping, isMetronome, project, playheadTick, totalTicks, setIsPlaying, setPlayheadTick]);

  const handlePause = useCallback(() => {
    if (!isPlaying) return;
    pauseProject();
    setIsPlaying(false);
    // playheadTick is preserved so the next Play call resumes from here.
  }, [isPlaying, setIsPlaying]);

  const handleStop = useCallback(() => {
    stopProject();
    setIsPlaying(false);
    setPlayheadTick(0);
  }, [setIsPlaying, setPlayheadTick]);

  // BPM change → push to both store and live engine
  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const bpm = Number(e.target.value);
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    updateSettings({ bpm });
    setEngineBpm(bpm);
  }, [updateSettings]);

  const posText  = formatTickFull(playheadTick, settings.timeSignature, settings.ppq);
  const nextThemeMode = getNextThemeMode(themeMode);

  return (
    <div className="transport-bar">
      <div className="transport-section transport-controls">
        <button
          className={`transport-btn${isPlaying ? ' active' : ''}`}
          onClick={handlePlay}
          disabled={isPlaying}
          title="재생 (스페이스)"
        >
          ▶
        </button>
        <button
          className="transport-btn"
          onClick={handlePause}
          disabled={!isPlaying}
          title="일시정지"
        >
          ⏸
        </button>
        <button className="transport-btn" onClick={handleStop} title="정지">
          ■
        </button>
        <button
          className={`transport-btn${isLooping ? ' active' : ''}`}
          onClick={() => setIsLooping(!isLooping)}
          title="반복"
        >
          ⟲
        </button>
        <button
          className={`transport-btn${isMetronome ? ' active' : ''}`}
          onClick={() => setIsMetronome(!isMetronome)}
          title="메트로놈"
        >
          ♪
        </button>
      </div>

      <div className="transport-divider" />

      <div className="transport-section transport-position">
        <span className="position-display">{posText}</span>
        <span
          className="tick-display"
          style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)' }}
        >
          틱 {playheadTick}
        </span>
      </div>

      <div className="transport-divider" />

      <div className="transport-section">
        <label className="transport-label">템포</label>
        <input
          type="number"
          className="transport-input bpm-input"
          value={settings.bpm}
          min={20} max={300}
          onChange={handleBpmChange}
        />
      </div>

      <div className="transport-section">
        <label className="transport-label">박자</label>
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
        <label className="transport-label">마디</label>
        <input
          type="number"
          className="transport-input"
          value={settings.bars}
          min={1} max={256}
          onChange={(e) => updateSettings({ bars: Number(e.target.value) })}
        />
      </div>

      <div className="transport-section">
        <label className="transport-label">스냅</label>
        <select
          className="transport-input"
          value={settings.snapUnit}
          onChange={(e) => updateSettings({ snapUnit: e.target.value as SnapUnit })}
        >
          {SNAP_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div className="transport-divider" />

      <div className="transport-section theme-mode-section" aria-label="Theme mode">
        <button
          type="button"
          className="theme-mode-btn"
          onClick={() => setThemeMode(nextThemeMode)}
          aria-pressed={themeMode === 'light'}
          title={`Switch to ${nextThemeMode} mode`}
        >
          <span className="theme-mode-icon" aria-hidden="true">
            {themeMode === 'dark' ? '☾' : '☀'}
          </span>
          <span className="theme-mode-text">{themeMode}</span>
        </button>
      </div>

      <div className="transport-section transport-project-name">
        <span className="project-name">{project.name}</span>
      </div>
    </div>
  );
};
