import React, { useEffect } from 'react';
import type { MarkerType } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';

const MARKER_TYPES: Array<{ type: MarkerType; label: string }> = [
  { type: 'none', label: '기본' },
  { type: 'start', label: '시작' },
  { type: 'loop', label: '루프' },
  { type: 'marker_loop', label: '마커 루프' },
  { type: 'marker_skip', label: '마커 스킵' },
  { type: 'marker_pause', label: '마커 일시정지' },
  { type: 'time_signature', label: '박자표 변경' },
  { type: 'start_recording', label: '녹음 시작' },
  { type: 'stop_recording', label: '녹음 중지' },
];

interface MarkerContextMenuProps {
  x: number;
  y: number;
  markerId: string;
  onClose: () => void;
}

export const MarkerContextMenu: React.FC<MarkerContextMenuProps> = ({ x, y, markerId, onClose }) => {
  const marker = useProjectStore((s) => s.playlistMarkers.find((m) => m.id === markerId));
  const updatePlaylistMarker = useProjectStore((s) => s.updatePlaylistMarker);
  const changeMarkerType = useProjectStore((s) => s.changeMarkerType);
  const moveContentAroundMarker = useProjectStore((s) => s.moveContentAroundMarker);
  const startRecordingAtSelection = useProjectStore((s) => s.startRecordingAtSelection);
  const stopRecordingAtSelection = useProjectStore((s) => s.stopRecordingAtSelection);
  const removePlaylistMarker = useProjectStore((s) => s.removePlaylistMarker);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);

  if (!marker) return null;

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="arrangement-menu marker-context-menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      <button onClick={() => {
        const nextName = window.prompt('마커 이름', marker.name);
        if (nextName) run(() => updatePlaylistMarker(markerId, { name: nextName }));
      }}>이름 바꾸기</button>
      <div className="arrangement-menu__separator" />
      {MARKER_TYPES.map((item) => (
        <button key={item.type} className={marker.type === item.type ? 'active' : ''} onClick={() => run(() => changeMarkerType(markerId, item.type))}>
          타입: {item.label}
        </button>
      ))}
      <div className="arrangement-menu__separator" />
      <button onClick={() => run(() => moveContentAroundMarker(markerId, 'left'))}>콘텐츠 왼쪽으로 이동</button>
      <button onClick={() => run(() => moveContentAroundMarker(markerId, 'right'))}>콘텐츠 오른쪽으로 이동</button>
      <button onClick={() => run(startRecordingAtSelection)}>선택에서 녹음 시작</button>
      <button onClick={() => run(stopRecordingAtSelection)}>선택에서 녹음 중지</button>
      <button onClick={() => run(() => removePlaylistMarker(markerId))}>삭제</button>
    </div>
  );
};
