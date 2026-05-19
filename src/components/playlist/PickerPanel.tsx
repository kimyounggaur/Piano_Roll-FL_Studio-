import React, { useMemo, useRef } from 'react';
import type { PickerEditTarget, PickerSortMode } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';

export const PickerPanel: React.FC = () => {
  const audioRegions = useProjectStore((s) => s.audioRegions);
  const midiClips = useProjectStore((s) => s.midiClips);
  const tracks = useProjectStore((s) => s.project.tracks);
  const pickerPanel = useProjectStore((s) => s.pickerPanel);
  const setPickerPanel = useProjectStore((s) => s.setPickerPanel);
  const dragWidthRef = useRef<{ x: number; width: number } | null>(null);

  const sources = useMemo(() => {
    const byName = new Map<string, { name: string; color: string; kind: 'audio' | 'midi'; trackName: string; empty: boolean }>();
    for (const clip of midiClips) {
      const track = tracks.find((t) => t.id === clip.trackId);
      byName.set(clip.name, { name: clip.name, color: clip.color, kind: 'midi', trackName: track?.name ?? '', empty: clip.notes.length === 0 });
    }
    for (const region of audioRegions) {
      const track = tracks.find((t) => t.id === region.trackId);
      if (!byName.has(region.name)) {
        byName.set(region.name, { name: region.name, color: region.color, kind: 'audio', trackName: track?.name ?? '', empty: false });
      }
    }
    return [...byName.values()].filter((source) => pickerPanel.showEmptyPatterns || !source.empty);
  }, [audioRegions, midiClips, pickerPanel.showEmptyPatterns, tracks]);

  const sorted = useMemo(() => {
    const next = [...sources];
    if (pickerPanel.sortMode === 'name') return next.sort((a, b) => a.name.localeCompare(b.name));
    if (pickerPanel.sortMode === 'color') return next.sort((a, b) => a.color.localeCompare(b.color));
    return next.sort((a, b) => a.trackName.localeCompare(b.trackName));
  }, [pickerPanel.sortMode, sources]);

  const onResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragWidthRef.current = { x: e.clientX, width: pickerPanel.width };
    const onMove = (ev: MouseEvent) => {
      const drag = dragWidthRef.current;
      if (!drag) return;
      const delta = pickerPanel.dockRight ? drag.x - ev.clientX : ev.clientX - drag.x;
      setPickerPanel({ width: Math.max(120, Math.min(420, drag.width + delta)) });
    };
    const onUp = () => {
      dragWidthRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className={`picker-panel${pickerPanel.dockRight ? ' picker-panel--dock-right' : ''}`} style={{ width: pickerPanel.width }}>
      {!pickerPanel.dockRight && <div className="picker-panel__resize-handle" onMouseDown={onResizeMouseDown} />}
      <div className="picker-panel__header">
        <span>Picker</span>
        <span className="picker-panel__header-actions">
          <button onClick={() => setPickerPanel({ dockRight: !pickerPanel.dockRight })}>{pickerPanel.dockRight ? 'Left' : 'Right'}</button>
          <button onClick={() => setPickerPanel({ visible: false })}>×</button>
        </span>
      </div>
      <div className="picker-panel__list">
        {sorted.map((source) => (
          <div
            key={source.name}
            className="picker-panel__item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/rolllab-clip', source.name);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="picker-panel__swatch" style={{ backgroundColor: source.color }} />
            <span>{source.name}</span>
            <small>{source.kind}</small>
          </div>
        ))}
        {sorted.length === 0 && <div className="picker-panel__empty">소스 없음</div>}
      </div>
      <div className="picker-panel__options">
        <label><input type="checkbox" checked={pickerPanel.showEmptyPatterns} onChange={(e) => setPickerPanel({ showEmptyPatterns: e.target.checked })} /> 빈 패턴 표시</label>
        <label><input type="checkbox" checked={pickerPanel.autoGroupPatterns} onChange={(e) => setPickerPanel({ autoGroupPatterns: e.target.checked })} /> 패턴 자동 그룹</label>
        <label><input type="checkbox" checked={pickerPanel.adjustStartTime} onChange={(e) => setPickerPanel({ adjustStartTime: e.target.checked })} /> 시작 시간 조정</label>
        <select value={pickerPanel.sortMode} onChange={(e) => setPickerPanel({ sortMode: e.target.value as PickerSortMode })}>
          <option value="name">이름순</option>
          <option value="color">색상순</option>
          <option value="mixer_track">믹서 트랙순</option>
        </select>
        <select value={pickerPanel.editTarget} onChange={(e) => setPickerPanel({ editTarget: e.target.value as PickerEditTarget })}>
          <option value="automatic">자동</option>
          <option value="channel_rack">채널 랙</option>
          <option value="piano_roll">피아노 롤</option>
          <option value="piano_roll_or_event">피아노 롤 또는 이벤트</option>
        </select>
      </div>
      {pickerPanel.dockRight && <div className="picker-panel__resize-handle" onMouseDown={onResizeMouseDown} />}
    </div>
  );
};
