import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';

export const GroupMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const groups = useProjectStore((s) => s.trackGroups);
  const groupSelectedTracks = useProjectStore((s) => s.groupSelectedTracks);
  const ungroupTracks = useProjectStore((s) => s.ungroupTracks);
  const toggleGroupCollapse = useProjectStore((s) => s.toggleGroupCollapse);
  const hideCollapsedGroups = useProjectStore((s) => s.playlistView.hideCollapsedGroups);
  const setPlaylistView = useProjectStore((s) => s.setPlaylistView);

  return (
    <span className="arrangement-dropdown">
      <button
        className={`arrangement-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Group 메뉴"
      >
        <span className="arrangement-icon-btn__ico" aria-hidden="true">⇄</span>
        <span className="arrangement-icon-btn__lbl">그룹 ▾</span>
      </button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline">
          <button onClick={() => { groupSelectedTracks(); setOpen(false); }}>선택 트랙 그룹화 Shift+G</button>
          <label><input type="checkbox" checked={hideCollapsedGroups} onChange={(e) => setPlaylistView({ hideCollapsedGroups: e.target.checked })} /> 접힌 그룹 숨기기</label>
          <div className="arrangement-menu__separator" />
          {groups.length === 0 && <span className="arrangement-menu__empty">그룹 없음</span>}
          {groups.map((group) => (
            <span className="arrangement-menu__row" key={group.id}>
              <button onClick={() => toggleGroupCollapse(group.id)}>{group.collapsed ? '펼치기' : '접기'} · {group.name}</button>
              <button onClick={() => ungroupTracks(group.id)}>해제</button>
            </span>
          ))}
        </div>
      )}
    </span>
  );
};
