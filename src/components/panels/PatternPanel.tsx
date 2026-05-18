import React from 'react';
import type { Pattern } from '../../types/music';
import { useProjectStore } from '../../store/projectStore';

// ═══════════════════════════════════════════════════════════════════
//  PatternPanel (#53)
//  Shows the project's patterns. The Piano Roll always edits the
//  active pattern's tracks (project.tracks remains the single source
//  of truth in MVP; future revision will swap project.tracks for
//  patterns[active].tracks).
// ═══════════════════════════════════════════════════════════════════
const EMPTY_PATTERNS: Pattern[] = [];

export const PatternPanel: React.FC = () => {
  const patterns = useProjectStore((s) => s.project.patterns ?? EMPTY_PATTERNS);
  const activeId = useProjectStore((s) => s.project.activePatternId);
  const addPattern = useProjectStore((s) => s.addPattern);
  const removePattern = useProjectStore((s) => s.removePattern);
  const duplicatePattern = useProjectStore((s) => s.duplicatePattern);
  const renamePattern = useProjectStore((s) => s.renamePattern);
  const setActivePattern = useProjectStore((s) => s.setActivePattern);

  return (
    <div style={panelStyle}>
      <h3 style={headingStyle}>패턴</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => addPattern()} style={btn}>+ 패턴 추가</button>
        {activeId && (
          <>
            <button onClick={() => duplicatePattern(activeId)} style={btn}>복제</button>
            <button onClick={() => removePattern(activeId)} style={{ ...btn, color: '#ffb2b5' }}>삭제</button>
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {patterns.length === 0 && (
          <div style={{ fontSize: 11, color: '#9aa399' }}>패턴이 없습니다. "+패턴 추가"로 시작하세요.</div>
        )}
        {patterns.map((p) => (
          <div
            key={p.id}
            onClick={() => setActivePattern(p.id)}
            onDoubleClick={() => {
              const name = window.prompt('패턴 이름', p.name);
              if (name && name.trim()) renamePattern(p.id, name.trim());
            }}
            style={{
              ...row,
              background: p.id === activeId ? 'rgba(159,232,112,0.18)' : 'transparent',
              borderColor: p.id === activeId ? '#9fe870' : '#2b2c28',
            }}
            title="더블클릭으로 이름 변경"
          >
            <span style={{ display: 'inline-block', width: 10, height: 10, background: p.color ?? '#9fe870', borderRadius: 2, marginRight: 6 }} />
            <span style={{ flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 10, color: '#9aa399' }}>{p.lengthBars}b</span>
          </div>
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
const btn: React.CSSProperties = {
  padding: '4px 8px', background: '#16170f', color: '#e8ebe6',
  border: '1px solid #2b2c28', borderRadius: 4, cursor: 'pointer', fontSize: 11,
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 8px',
  border: '1px solid #2b2c28', borderRadius: 4, cursor: 'pointer', fontSize: 12,
};
