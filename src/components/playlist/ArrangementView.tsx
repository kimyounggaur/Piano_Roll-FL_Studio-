import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioRegion, MidiClip, TrackId } from '../../types/music';
import type { AudioDropBehavior } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';
import { snapPlaylistTick } from '../../utils/playlistSnap';
import { ticksPerBar } from '../../utils/time';
import { useArrangementDrag } from '../../hooks/useArrangementDrag';
import { useArrangementShortcuts } from '../../hooks/useArrangementShortcuts';
import { ArrangementCanvas } from './ArrangementCanvas';
import { ArrangementContextMenu } from './ArrangementContextMenu';
import { ArrangementRuler } from './ArrangementRuler';
import { ArrangementToolbar } from './ArrangementToolbar';
import { ClipLayer } from './ClipLayer';
import { DropBehaviorDialog } from './DropBehaviorDialog';
import { MarkerContextMenu } from './MarkerContextMenu';
import { MiniPlaylistPreview } from './MiniPlaylistPreview';
import { PerformanceModeOverlay } from './PerformanceModeOverlay';
import { PickerPanel } from './PickerPanel';
import { PlayheadLine } from './PlayheadLine';
import { PlaylistMarkerLane } from './PlaylistMarkerLane';
import { RubberBandSelect } from './RubberBandSelect';
import { TrackLabelColumn } from './TrackLabelColumn';
import './ArrangementView.css';

interface ContextMenuState {
  x: number;
  y: number;
  atTick: number;
  clipId: string | null;
}

interface MarkerMenuState {
  x: number;
  y: number;
  markerId: string;
}

interface PendingAudioDrop {
  files: File[];
  trackId: TrackId;
  startTick: number;
}

function computePeaks(buffer: AudioBuffer, windowSize = 512): Float32Array {
  const data = buffer.getChannelData(0);
  const numWins = Math.ceil(data.length / windowSize);
  const peaks = new Float32Array(numWins * 2);
  for (let i = 0; i < numWins; i++) {
    let min = 0;
    let max = 0;
    const end = Math.min((i + 1) * windowSize, data.length);
    for (let j = i * windowSize; j < end; j++) {
      if (data[j] > max) max = data[j];
      if (data[j] < min) min = data[j];
    }
    peaks[i * 2] = max;
    peaks[i * 2 + 1] = Math.abs(min);
  }
  return peaks;
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function cloneMidiClip(source: MidiClip, trackId: TrackId, startTick: number): MidiClip {
  return {
    ...source,
    id: makeId('midi-clip'),
    trackId,
    startTick,
    notes: source.notes.map((note) => ({ ...note, id: makeId('note'), trackId })),
  };
}

function cloneAudioRegion(source: AudioRegion, trackId: TrackId, startTick: number): AudioRegion {
  return { ...source, id: makeId('audio-region'), trackId, startTick };
}

export const ArrangementView: React.FC = () => {
  useArrangementShortcuts();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 720 });
  const [loadingTrackId, setLoadingTrackId] = useState<TrackId | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenuState | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingAudioDrop | null>(null);
  const { rect: rubberBandRect, beginRubberBand, updateRubberBand, endRubberBand } = useArrangementDrag();

  const project = useProjectStore((s) => s.project);
  const tracks = useProjectStore((s) => s.project.tracks);
  const activeTool = useProjectStore((s) => s.activeTool);
  const audioRegions = useProjectStore((s) => s.audioRegions);
  const midiClips = useProjectStore((s) => s.midiClips);
  const groups = useProjectStore((s) => s.trackGroups);
  const playlistView = useProjectStore((s) => s.playlistView);
  const pickerPanel = useProjectStore((s) => s.pickerPanel);
  const audioDropBehavior = useProjectStore((s) => s.audioDropBehavior);
  const arrangementScrollX = useProjectStore((s) => s.arrangementScrollX);
  const arrangementScrollY = useProjectStore((s) => s.arrangementScrollY);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());
  const setArrangementScroll = useProjectStore((s) => s.setArrangementScroll);
  const zoomInPlaylist = useProjectStore((s) => s.zoomInPlaylist);
  const zoomOutPlaylist = useProjectStore((s) => s.zoomOutPlaylist);
  const setPlayheadTick = useProjectStore((s) => s.setPlayheadTick);
  const addAudioRegion = useProjectStore((s) => s.addAudioRegion);
  const setAudioRegionWaveform = useProjectStore((s) => s.setAudioRegionWaveform);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const addMidiClipFromTrack = useProjectStore((s) => s.addMidiClipFromTrack);
  const deselectAllClips = useProjectStore((s) => s.deselectAllClips);
  const selectClipsInRect = useProjectStore((s) => s.selectClipsInRect);

  const laneHeight = Math.round(72 * playlistView.trackHeightPercent / 100);
  const hiddenTrackIds = useMemo(() => new Set(
    playlistView.hideCollapsedGroups
      ? groups.filter((group) => group.collapsed).flatMap((group) => group.trackIds)
      : [],
  ), [groups, playlistView.hideCollapsedGroups]);
  const visibleTracks = useMemo(() => tracks.filter((track) => !hiddenTrackIds.has(track.id)), [hiddenTrackIds, tracks]);
  const lanesHeight = Math.max(containerSize.height, visibleTracks.length * laneHeight);
  const totalTicks = ticksPerBar(project.settings.ppq, project.settings.timeSignature) * project.settings.bars;
  const maxClipTick = Math.max(
    totalTicks,
    1,
    ...audioRegions.map((region) => region.startTick + region.durationTicks),
    ...midiClips.map((clip) => clip.startTick + clip.durationTicks),
  );
  const timelineWidth = Math.max(containerSize.width * 2, maxClipTick * ppt + 500);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: Math.max(360, Math.round(entry.contentRect.width)),
        height: Math.max(280, Math.round(entry.contentRect.height)),
      });
    });
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (Math.abs(node.scrollLeft - arrangementScrollX) > 1) node.scrollLeft = arrangementScrollX;
    if (Math.abs(node.scrollTop - arrangementScrollY) > 1) node.scrollTop = arrangementScrollY;
  }, [arrangementScrollX, arrangementScrollY]);

  const tickFromLaneClientX = useCallback((clientX: number) => {
    const rect = lanesRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.round((clientX - rect.left) / ppt));
  }, [ppt]);

  const trackFromLaneClientY = useCallback((clientY: number) => {
    const rect = lanesRef.current?.getBoundingClientRect();
    if (!rect) return visibleTracks[0] ?? null;
    const y = clientY - rect.top;
    return visibleTracks[Math.max(0, Math.min(visibleTracks.length - 1, Math.floor(y / laneHeight)))] ?? null;
  }, [laneHeight, visibleTracks]);

  const snapTickForDrop = useCallback((tick: number) =>
    snapPlaylistTick(tick, playlistView.snapMode, project, [...audioRegions, ...midiClips]),
  [audioRegions, midiClips, playlistView.snapMode, project]);

  const processAudioFiles = useCallback(async (files: File[], trackId: TrackId, startTick: number) => {
    if (!files.length) return;
    setLoadingTrackId(trackId);
    let cursorTick = startTick;
    try {
      const ctx = new AudioContext();
      for (const file of files) {
        const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
        const peaks = computePeaks(buffer);
        const track = useProjectStore.getState().project.tracks.find((candidate) => candidate.id === trackId);
        const durationTicks = Math.max(1, Math.round(buffer.duration * project.settings.bpm * project.settings.ppq / 60));
        const beforeIds = new Set(useProjectStore.getState().audioRegions.map((region) => region.id));
        addAudioRegion({
          trackId,
          startTick: cursorTick,
          durationTicks,
          name: file.name.replace(/\.[^.]+$/, ''),
          audioBuffer: buffer,
          gain: 1,
          fadeInTicks: 0,
          fadeOutTicks: 0,
          muted: false,
          looped: false,
          color: track?.color ?? '#9fe870',
          pitchSemitones: 0,
          timewarpFactor: 1,
        });
        const created = useProjectStore.getState().audioRegions.find((region) => !beforeIds.has(region.id));
        if (created) setAudioRegionWaveform(created.id, peaks);
        cursorTick += durationTicks;
      }
    } finally {
      setLoadingTrackId(null);
    }
  }, [addAudioRegion, project.settings.bpm, project.settings.ppq, setAudioRegionWaveform]);

  const resolveTrackForDropBehavior = useCallback((behavior: Exclude<AudioDropBehavior, 'always_ask'>, fallbackTrackId: TrackId, files: File[]) => {
    if (behavior === 'audio_clips') return fallbackTrackId;
    addTrack();
    const newTrackId = useProjectStore.getState().project.activeTrackId ?? fallbackTrackId;
    if (behavior === 'instrument_tracks') {
      updateTrack(newTrackId, { instrument: { type: 'sampler', preset: URL.createObjectURL(files[0]) } });
    }
    return newTrackId;
  }, [addTrack, updateTrack]);

  const completeAudioDrop = useCallback(async (behavior: Exclude<AudioDropBehavior, 'always_ask'> | null, pending = pendingDrop) => {
    if (!pending || !behavior) {
      setPendingDrop(null);
      return;
    }
    const targetTrackId = resolveTrackForDropBehavior(behavior, pending.trackId, pending.files);
    if (behavior !== 'instrument_tracks') {
      await processAudioFiles(pending.files, targetTrackId, pending.startTick);
    }
    setPendingDrop(null);
  }, [pendingDrop, processAudioFiles, resolveTrackForDropBehavior]);

  const clonePickerSource = useCallback((name: string, trackId: TrackId, rawTick: number) => {
    const startTick = pickerPanel.adjustStartTime ? snapTickForDrop(rawTick) : rawTick;
    const sourceAudio = useProjectStore.getState().audioRegions.find((region) => region.name === name);
    const sourceMidi = useProjectStore.getState().midiClips.find((clip) => clip.name === name);
    if (sourceAudio) {
      const clone = cloneAudioRegion(sourceAudio, trackId, startTick);
      useProjectStore.setState((state) => ({ audioRegions: [...state.audioRegions, clone], selectedClipIds: new Set([clone.id]) }));
      return;
    }
    if (sourceMidi) {
      const clone = cloneMidiClip(sourceMidi, trackId, startTick);
      useProjectStore.setState((state) => ({ midiClips: [...state.midiClips, clone], selectedClipIds: new Set([clone.id]) }));
    }
  }, [pickerPanel.adjustStartTime, snapTickForDrop]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const track = trackFromLaneClientY(e.clientY);
    if (!track) return;
    const dropTick = snapTickForDrop(tickFromLaneClientX(e.clientX));
    const pickerClipName = e.dataTransfer.getData('application/rolllab-clip');
    if (pickerClipName) {
      clonePickerSource(pickerClipName, track.id, dropTick);
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('audio/'));
    if (!files.length) return;
    if (audioDropBehavior === 'always_ask') {
      setPendingDrop({ files, trackId: track.id, startTick: dropTick });
      return;
    }
    void completeAudioDrop(audioDropBehavior, { files, trackId: track.id, startTick: dropTick });
  }, [audioDropBehavior, clonePickerSource, completeAudioDrop, snapTickForDrop, tickFromLaneClientX, trackFromLaneClientY]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((file) => file.type.startsWith('audio/'));
    const trackId = project.activeTrackId ?? project.tracks[0]?.id;
    if (trackId) {
      void processAudioFiles(files, trackId, useProjectStore.getState().playheadTick);
    }
    e.target.value = '';
  }, [processAudioFiles, project.activeTrackId, project.tracks]);

  const handleLaneMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.clip-block, .perf-trigger')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const track = trackFromLaneClientY(e.clientY);
    const rawTick = tickFromLaneClientX(e.clientX);
    const snappedTick = snapTickForDrop(rawTick);
    setPlayheadTick(snappedTick);
    if ((activeTool === 'draw' || activeTool === 'paint') && track) {
      addMidiClipFromTrack(track.id, snappedTick);
      return;
    }
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) deselectAllClips();
    beginRubberBand(x, y);
    const onMove = (ev: MouseEvent) => {
      updateRubberBand(ev.clientX - rect.left, ev.clientY - rect.top);
    };
    const onUp = () => {
      const selection = endRubberBand();
      if (selection) {
        const startTick = Math.round(Math.min(selection.x1, selection.x2) / ppt);
        const endTick = Math.round(Math.max(selection.x1, selection.x2) / ppt);
        const minTrack = Math.floor(Math.min(selection.y1, selection.y2) / laneHeight);
        const maxTrack = Math.floor(Math.max(selection.y1, selection.y2) / laneHeight);
        const trackIds = visibleTracks.slice(Math.max(0, minTrack), Math.min(visibleTracks.length, maxTrack + 1)).map((item) => item.id);
        selectClipsInRect(startTick, endTick, trackIds);
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [activeTool, addMidiClipFromTrack, beginRubberBand, deselectAllClips, endRubberBand, laneHeight, ppt, selectClipsInRect, setPlayheadTick, snapTickForDrop, tickFromLaneClientX, trackFromLaneClientY, updateRubberBand, visibleTracks]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.clip-block, .perf-trigger')) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, atTick: snapTickForDrop(tickFromLaneClientX(e.clientX)), clipId: null });
  }, [snapTickForDrop, tickFromLaneClientX]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomInPlaylist();
    else zoomOutPlaylist();
  }, [zoomInPlaylist, zoomOutPlaylist]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setArrangementScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop);
  }, [setArrangementScroll]);

  const cssVars = {
    '--playlist-lane-h': `${laneHeight}px`,
    '--playlist-label-w': '154px',
  } as React.CSSProperties;

  return (
    <div className="arrangement-view" ref={containerRef} style={cssVars}>
      <input ref={fileInputRef} type="file" accept="audio/*" multiple hidden onChange={handleFileInputChange} />
      <div className="arrangement-view__main">
        <ArrangementToolbar onImportAudio={() => fileInputRef.current?.click()} />
        <div className="arrangement-view__body">
          {!pickerPanel.dockRight && pickerPanel.visible && <PickerPanel />}
          <TrackLabelColumn laneHeight={laneHeight} />
          <div className="arrangement-view__scroll-area" ref={scrollRef} onScroll={handleScroll} onWheel={handleWheel}>
            <div className="arrangement-view__timeline" style={{ width: timelineWidth, minHeight: lanesHeight + 52 }}>
              <ArrangementRuler width={timelineWidth} />
              <PlaylistMarkerLane width={timelineWidth} onOpenContextMenu={(x, y, markerId) => setMarkerMenu({ x, y, markerId })} />
              <div
                ref={lanesRef}
                className="arrangement-view__lanes"
                style={{ height: lanesHeight }}
                onMouseDown={handleLaneMouseDown}
                onContextMenu={handleContextMenu}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {visibleTracks.map((track, index) => (
                  <div key={track.id} className={`arrangement-track-lane arrangement-track-lane--${index % 2 === 0 ? 'even' : 'odd'}`} style={{ top: index * laneHeight, height: laneHeight, width: timelineWidth }} />
                ))}
                <ArrangementCanvas width={timelineWidth} height={lanesHeight} />
                <ClipLayer laneHeight={laneHeight} onOpenContextMenu={(x, y, clipId, atTick) => setContextMenu({ x, y, clipId, atTick })} />
                <PerformanceModeOverlay laneHeight={laneHeight} />
                <PlayheadLine height={lanesHeight} />
                <RubberBandSelect rect={rubberBandRect} />
                {loadingTrackId && <div className="drop-hint">오디오 디코딩 중...</div>}
                {!loadingTrackId && audioRegions.length === 0 && midiClips.length === 0 && <div className="drop-hint">오디오 파일 또는 피커 항목을 드롭</div>}
              </div>
            </div>
          </div>
          {pickerPanel.dockRight && pickerPanel.visible && <PickerPanel />}
        </div>
        {playlistView.miniPreviewEnabled && <MiniPlaylistPreview timelineWidth={timelineWidth} viewportWidth={containerSize.width} />}
      </div>
      {contextMenu && <ArrangementContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
      {markerMenu && <MarkerContextMenu {...markerMenu} onClose={() => setMarkerMenu(null)} />}
      {pendingDrop && <DropBehaviorDialog onChoose={(behavior) => void completeAudioDrop(behavior)} />}
    </div>
  );
};
