import React from 'react';
import { useProjectStore } from '../../store/projectStore';

export const GhostChannelPanel: React.FC = () => {
  const tracks = useProjectStore((s) => s.project.tracks);
  const activeTrackId = useProjectStore((s) => s.project.activeTrackId);
  const settings = useProjectStore((s) => s.project.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const toggleGhostEditable = useProjectStore((s) => s.toggleGhostEditable);
  const setGhostVisibleTracks = useProjectStore((s) => s.setGhostVisibleTracks);
  const toggleGhostVisibleTrack = useProjectStore((s) => s.toggleGhostVisibleTrack);

  const visible = settings.ghostVisibleTrackIds;
  const isShown = (id: string) => visible === 'all' || visible === undefined || (Array.isArray(visible) && visible.includes(id));

  return (
    <div style={panelStyle}>
      <h3 style={headingStyle}>고스트 트랙</h3>
      <label style={rowStyle}>
        <input
          type="checkbox"
          checked={!!settings.ghostNotesVisible}
          onChange={(e) => updateSettings({ ghostNotesVisible: e.target.checked })}
        /> 고스트 표시 (Alt+V)
      </label>
      <label style={rowStyle}>
        <input
          type="checkbox"
          checked={!!settings.ghostEditable}
          onChange={toggleGhostEditable}
        /> 고스트 직접 편집 (Ctrl+Alt+V)
      </label>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
        <button onClick={() => setGhostVisibleTracks('all')} style={smallBtn}>모두 표시</button>
        <button onClick={() => setGhostVisibleTracks([])} style={smallBtn}>모두 숨김</button>
      </div>
      <div style={{ maxHeight: 200, overflow: 'auto' }}>
        {tracks.map((t) => (
          <label
            key={t.id}
            style={{
              ...rowStyle,
              opacity: t.id === activeTrackId ? 0.5 : 1,
              cursor: t.id === activeTrackId ? 'not-allowed' : 'pointer',
            }}
            title={t.id === activeTrackId ? '활성 트랙 (고스트 대상 아님)' : ''}
          >
            <input
              type="checkbox"
              disabled={t.id === activeTrackId}
              checked={isShown(t.id)}
              onChange={() => toggleGhostVisibleTrack(t.id)}
            />
            <span style={{ display: 'inline-block', width: 10, height: 10, background: t.color, marginRight: 6, borderRadius: 2 }} />
            {t.name}
          </label>
        ))}
      </div>
    </div>
  );
};

const panelStyle: React.CSSProperties = {
  background: '#0e0f0c', color: '#e8ebe6', padding: 12, borderRadius: 6,
  border: '1px solid #2b2c28', fontSize: 13,
};
const headingStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 14, color: '#9fe870' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '3px 0' };
const smallBtn: React.CSSProperties = {
  padding: '4px 8px', background: '#16170f', color: '#e8ebe6',
  border: '1px solid #2b2c28', borderRadius: 4, cursor: 'pointer', fontSize: 11,
};
