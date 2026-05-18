import React from 'react';
import { SHORTCUT_CATALOG } from '../../hooks/usePianoRollShortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUP_LABEL: Record<string, string> = {
  transport: '재생',
  tool:      '툴',
  edit:      '편집',
  move:      '이동 / 크기',
  view:      '보기',
};

export const ShortcutsHelp: React.FC<Props> = ({ open, onClose }) => {
  if (!open) return null;

  const grouped = SHORTCUT_CATALOG.reduce<Record<string, typeof SHORTCUT_CATALOG>>((acc, s) => {
    (acc[s.group] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a2e', color: '#e2e2e6', padding: 24, borderRadius: 8,
          maxWidth: 640, maxHeight: '80vh', overflow: 'auto',
          border: '1px solid #333',
          fontFamily: 'system-ui, sans-serif', fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>키보드 단축키</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: '#9fe870', border: 'none', cursor: 'pointer' }}>닫기</button>
        </div>
        {Object.entries(grouped).map(([group, items]) => (
          <section key={group} style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '8px 0 4px', fontSize: 12, color: '#9fe870', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {GROUP_LABEL[group] ?? group}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {items.map((s) => (
                  <tr key={s.keys}>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: '#ffc091', whiteSpace: 'nowrap' }}>
                      {s.keys}
                    </td>
                    <td style={{ padding: '3px 8px' }}>{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
};
