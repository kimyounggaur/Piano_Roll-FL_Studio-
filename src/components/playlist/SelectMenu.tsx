import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';

export const SelectMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const deselectAllClips = useProjectStore((s) => s.deselectAllClips);
  const selectAllClips = useProjectStore((s) => s.selectAllClips);
  const selectMutedClips = useProjectStore((s) => s.selectMutedClips);
  const selectOverlappingClips = useProjectStore((s) => s.selectOverlappingClips);
  const selectStackedClips = useProjectStore((s) => s.selectStackedClips);
  const invertClipSelection = useProjectStore((s) => s.invertClipSelection);
  const selectTimeAroundSelection = useProjectStore((s) => s.selectTimeAroundSelection);
  const selectAdjacentTime = useProjectStore((s) => s.selectAdjacentTime);
  const selectBySource = useProjectStore((s) => s.selectBySource);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };
  const firstSelectedId = [...selectedClipIds][0] ?? null;

  return (
    <span className="arrangement-dropdown">
      <button
        className={`arrangement-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Selection 메뉴 (전체 선택 / 반전 등)"
      >
        <span className="arrangement-icon-btn__ico" aria-hidden="true">☰</span>
        <span className="arrangement-icon-btn__lbl">선택 메뉴 ▾</span>
      </button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline">
          <button onClick={() => run(deselectAllClips)}>선택 해제</button>
          <button onClick={() => run(selectAllClips)}>전체 선택 Ctrl+A</button>
          <button disabled={!firstSelectedId} onClick={() => firstSelectedId && run(() => selectBySource(firstSelectedId))}>소스로 선택 Shift+C</button>
          <button onClick={() => run(selectMutedClips)}>음소거된 클립 선택</button>
          <button onClick={() => run(selectOverlappingClips)}>겹치는 클립 선택</button>
          <button onClick={() => run(selectStackedClips)}>쌓인 클립 선택</button>
          <button onClick={() => run(invertClipSelection)}>선택 반전 Shift+I</button>
          <button onClick={() => run(selectTimeAroundSelection)}>선택 주변 시간 Ctrl+Enter</button>
          <button onClick={() => run(() => selectAdjacentTime('prev'))}>이전 시간 Ctrl+Left</button>
          <button onClick={() => run(() => selectAdjacentTime('next'))}>다음 시간 Ctrl+Right</button>
        </div>
      )}
    </span>
  );
};
