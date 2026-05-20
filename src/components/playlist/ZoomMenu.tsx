import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';

export const ZoomMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const zoomInPlaylist = useProjectStore((s) => s.zoomInPlaylist);
  const zoomOutPlaylist = useProjectStore((s) => s.zoomOutPlaylist);
  const setPlaylistZoomPreset = useProjectStore((s) => s.setPlaylistZoomPreset);
  const centerPlaylistView = useProjectStore((s) => s.centerPlaylistView);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <span className="arrangement-dropdown">
      <button
        className={`arrangement-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Zoom 메뉴"
      >
        <span className="arrangement-icon-btn__ico" aria-hidden="true">🔍</span>
        <span className="arrangement-icon-btn__lbl">확대 ▾</span>
      </button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline">
          <button onClick={() => run(zoomInPlaylist)}>줌 인 PageUp</button>
          <button onClick={() => run(zoomOutPlaylist)}>줌 아웃 PageDown</button>
          <button onClick={() => run(centerPlaylistView)}>재생헤드 중앙 Shift+0</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(() => setPlaylistZoomPreset('1'))}>퀵 줌 1 Shift+1</button>
          <button onClick={() => run(() => setPlaylistZoomPreset('2'))}>퀵 줌 2 Shift+2</button>
          <button onClick={() => run(() => setPlaylistZoomPreset('3'))}>퀵 줌 3 Shift+3</button>
          <button onClick={() => run(() => setPlaylistZoomPreset('far'))}>멀리 줌 Shift+4</button>
          <button onClick={() => run(() => setPlaylistZoomPreset('selection'))}>선택 영역 Shift+5</button>
          <button onClick={() => run(() => setPlaylistZoomPreset('performance'))}>퍼포먼스 Shift+6</button>
        </div>
      )}
    </span>
  );
};
