import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { readFromLocalStorage, clearLocalStorage } from '../../utils/projectSerialization';

// ═══════════════════════════════════════════════════════════════════
//  RestorePrompt — on first mount, peek at localStorage. If a saved
//  project exists and isn't trivially empty, ask the user before
//  replacing the freshly-initialized default project.
// ═══════════════════════════════════════════════════════════════════
export const RestorePrompt: React.FC = () => {
  const replaceProject = useProjectStore((s) => s.replaceProject);
  const [pending, setPending] = useState<ReturnType<typeof readFromLocalStorage> | undefined>(undefined);

  useEffect(() => {
    const saved = readFromLocalStorage();
    // Only prompt when the save isn't an empty stub.
    const hasContent = !!saved && saved.tracks.some((t) => t.notes.length > 0);
    setPending(hasContent ? saved : null);
  }, []);

  if (!pending) return null;

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={dialog}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--accent-1, #9fe870)' }}>
          이전 작업 복원
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-2, #bdbfb9)' }}>
          저장된 프로젝트 "{pending.name}" — 트랙 {pending.tracks.length}개를 발견했습니다. 불러올까요?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => { clearLocalStorage(); setPending(null); }}
            style={btnSecondary}
          >
            새로 시작
          </button>
          <button
            onClick={() => { replaceProject(pending); setPending(null); }}
            style={btnPrimary}
          >
            복원
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const dialog: React.CSSProperties = {
  background: '#15170f', color: '#e8ebe6',
  padding: 16, borderRadius: 8, border: '1px solid #2b2c28',
  maxWidth: 420, width: '100%',
};
const btnPrimary: React.CSSProperties = {
  padding: '6px 14px', background: '#9fe870', color: '#163300',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const btnSecondary: React.CSSProperties = {
  padding: '6px 14px', background: 'transparent', color: '#e8ebe6',
  border: '1px solid #3b3d36', borderRadius: 4, cursor: 'pointer',
};
