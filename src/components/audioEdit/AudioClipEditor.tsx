import React, { useState, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { AudioRegionBlock } from './AudioRegionBlock';
import { AudioClipInspector } from './AudioClipInspector';
import './AudioClipEditor.css';

type AudioTool = 'pointer' | 'scissors' | 'fade' | 'loop';

const EMPTY_AUDIO_REGIONS: import('../../types/music').AudioRegion[] = [];

function computePeaks(buffer: AudioBuffer, windowSize = 512): Float32Array {
  const data     = buffer.getChannelData(0);
  const numWins  = Math.ceil(data.length / windowSize);
  const peaks    = new Float32Array(numWins * 2);
  for (let i = 0; i < numWins; i++) {
    let min = 0, max = 0;
    const end = Math.min((i + 1) * windowSize, data.length);
    for (let j = i * windowSize; j < end; j++) {
      if (data[j] > max) max = data[j];
      if (data[j] < min) min = data[j];
    }
    peaks[i * 2]     = max;
    peaks[i * 2 + 1] = Math.abs(min);
  }
  return peaks;
}

export const AudioClipEditor: React.FC = () => {
  const tracks           = useProjectStore((s) => s.project.tracks);
  const audioRegions     = useProjectStore((s) => s.audioRegions ?? EMPTY_AUDIO_REGIONS);
  const addAudioRegion   = useProjectStore((s) => s.addAudioRegion);
  const setAudioRegionWaveform = useProjectStore((s) => s.setAudioRegionWaveform);
  const viewport         = useProjectStore((s) => s.viewport);

  const [tool, setTool]           = useState<AudioTool>('pointer');
  const [snapEnabled, setSnap]    = useState(true);
  const [gridVisible, setGrid]    = useState(true);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [loadingTrackId, setLoading] = useState<string | null>(null);

  const { pixelsPerTick, scrollX } = viewport;
  const snapTicks = useProjectStore((s) => s.snapTicks());

  const totalWidth = Math.max(
    1200,
    tracks.reduce((acc) => acc, 0) +
    audioRegions.reduce((max, r) => Math.max(max, r.startTick + r.durationTicks), 0) * pixelsPerTick + 200,
  );

  const LANE_H = 72;

  const handleDrop = useCallback(async (trackId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('audio/'));
    if (files.length === 0) return;
    setLoading(trackId);
    try {
      const ctx    = new AudioContext();
      const buffer = await ctx.decodeAudioData(await files[0].arrayBuffer());
      const peaks  = computePeaks(buffer);
      const track  = tracks.find((t) => t.id === trackId);
      // Estimate startTick from drop position
      const rect   = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const xInLane = e.clientX - rect.left + scrollX;
      const startTick = Math.max(0, Math.round(xInLane / pixelsPerTick));
      const durationTicks = Math.round((buffer.duration * 1000 / (60000 / 120)) * 480); // rough estimate
      addAudioRegion({
        trackId,
        startTick,
        durationTicks,
        name: files[0].name.replace(/\.[^.]+$/, ''),
        gain: 1,
        fadeInTicks: 0,
        fadeOutTicks: 0,
        muted: false,
        looped: false,
        color: track?.color ?? '#9fe870',
        pitchSemitones: 0,
        timewarpFactor: 1,
      });
      // find the newly created region by startTick and set waveform
      const state = useProjectStore.getState();
      const created = state.audioRegions.find(
        (r) => r.trackId === trackId && r.startTick === startTick
      );
      if (created) setAudioRegionWaveform(created.id, peaks);
    } catch (err) {
      console.error('Audio decode failed', err);
    } finally {
      setLoading(null);
    }
  }, [tracks, addAudioRegion, setAudioRegionWaveform, pixelsPerTick, scrollX]);

  return (
    <div className="audio-editor" style={{ flex: 1 }}>
      {/* ── Toolbar ── */}
      <div className="audio-editor-toolbar">
        {([
          { id: 'pointer'  as AudioTool, label: '▲ 포인터' },
          { id: 'scissors' as AudioTool, label: '✂ 가위' },
          { id: 'fade'     as AudioTool, label: '~ 페이드' },
          { id: 'loop'     as AudioTool, label: '↺ 루프' },
        ] as const).map((t) => (
          <button
            key={t.id}
            className={`tool-btn${tool === t.id ? ' active' : ''}`}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="divider" />
        <label>
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnap(e.target.checked)} />
          스냅
        </label>
        <label>
          <input type="checkbox" checked={gridVisible} onChange={(e) => setGrid(e.target.checked)} />
          그리드
        </label>
      </div>

      {/* ── Body ── */}
      <div className="audio-editor-body">
        {/* Track labels column */}
        <div className="audio-track-labels">
          {tracks.map((track) => (
            <div key={track.id} className="audio-track-label" style={{ height: LANE_H, color: track.color }}>
              {track.name}
            </div>
          ))}
        </div>

        {/* Scrollable lanes */}
        <div className="audio-scroll-area" style={{ overflowX: 'auto' }}>
          {/* Ruler */}
          <div className="audio-ruler" style={{ width: totalWidth }} />

          {/* One lane per track */}
          {tracks.map((track, idx) => {
            const regionsInTrack = audioRegions.filter((r) => r.trackId === track.id);
            return (
              <div
                key={track.id}
                className={`audio-track-lane ${idx % 2 === 0 ? 'even' : 'odd'}${loadingTrackId === track.id ? ' drop-active' : ''}`}
                style={{ height: LANE_H, width: totalWidth }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(track.id, e)}
              >
                {loadingTrackId === track.id && (
                  <div className="loading-spinner">
                    <span className="spinner-icon">⟳</span> 디코딩 중...
                  </div>
                )}
                {regionsInTrack.map((region) => (
                  <AudioRegionBlock
                    key={region.id}
                    region={region}
                    pixelsPerTick={pixelsPerTick}
                    laneHeight={LANE_H}
                    tool={tool}
                    selected={selectedId === region.id}
                    onSelect={setSelected}
                    snapEnabled={snapEnabled}
                    snapTicks={snapTicks}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Inspector */}
        <AudioClipInspector regionId={selectedId} />
      </div>
    </div>
  );
};
