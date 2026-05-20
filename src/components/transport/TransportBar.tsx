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
import type { SnapUnit, ActiveView } from '../../types/music';
import { SNAP_SHORTCUT_OPTIONS } from '../../utils/snapShortcuts';
import {
  applyThemeMode,
  getNextThemeMode,
  readStoredThemeMode,
  writeStoredThemeMode,
  type ThemeMode,
} from '../../themeMode';
import './TransportBar.css';

const VIEW_TABS: { id: ActiveView; label: string }[] = [
  { id: 'piano-roll',  label: '🎹 MIDI Roll' },
  { id: 'audio-edit',  label: '🎵 Audio Edit' },
  { id: 'automation',  label: '⚡ Automation' },
];

export const TransportBar: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const {
    project, isPlaying, isLooping, isMetronome, playheadTick,
    updateSettings, setIsPlaying, setIsLooping, setIsMetronome,
    setPlayheadTick, totalTicks, setSnapUnit, setPlaylistView,
  } = useProjectStore();
  const activeView   = useProjectStore((s) => s.activeView);
  const setActiveView = useProjectStore((s) => s.setActiveView);
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

  const handleSnapChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSnapUnit(e.target.value as SnapUnit);
    if (activeView === 'audio-edit') {
      setPlaylistView({ snapMode: 'main' });
    }
  }, [activeView, setPlaylistView, setSnapUnit]);

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
          onChange={handleSnapChange}
        >
          {SNAP_SHORTCUT_OPTIONS.map(({ key, unit }) => (
            <option key={unit} value={unit}>{key} = {unit}</option>
          ))}
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

      <div className="transport-divider" />

      <div className="transport-section view-tabs" role="tablist" aria-label="편집 뷰">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeView === tab.id}
            onClick={() => setActiveView(tab.id)}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 120ms ease',
              background: activeView === tab.id ? '#9fe870' : 'rgba(255,255,255,0.06)',
              color: activeView === tab.id ? '#163300' : '#b8bcb5',
              fontWeight: activeView === tab.id ? 600 : 400,
              borderRight: '1px solid rgba(255,255,255,0.12)',
            }}
            onMouseEnter={(e) => {
              if (activeView !== tab.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={(e) => {
              if (activeView !== tab.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};
