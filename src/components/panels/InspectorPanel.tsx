import React, { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { StrumDirection, ArpPattern } from '../../types/music';
import { NOTE_COLOR_GROUPS } from '../../types/music';
import './InspectorPanel.css';

const ARP_PATTERNS: { value: ArpPattern; label: string }[] = [
  { value: 'up',     label: '상행' },
  { value: 'down',   label: '하행' },
  { value: 'upDown', label: '상행→하행' },
  { value: 'random', label: '랜덤' },
];

export const InspectorPanel: React.FC = () => {
  const {
    project, updateSettings, updateNote,
    exportJSON, importJSON,
    strumSelectedNotes, arpeggiateSelectedNotes,
    randomizeVelocitySelectedNotes, scaleVelocitySelectedNotes,
    muteSelectedNotes, unmuteSelectedNotes, setColorGroupForSelectedNotes,
    setVelocityForSelectedNotes,
  } = useProjectStore();
  const activeTrack   = project.tracks.find((t) => t.id === project.activeTrackId);
  const selectedNotes = activeTrack?.notes.filter((n) => n.selected) ?? [];
  const settings      = project.settings;
  const hasSelection  = selectedNotes.length > 0;

  const handleExport = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.rolllab.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportJSON, project.name]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.rolllab.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === 'string') importJSON(reader.result); };
      reader.readAsText(file);
    };
    input.click();
  }, [importJSON]);

  const handleStrum = () => {
    strumSelectedNotes(settings.strumAmountTicks, settings.strumDirection);
  };
  const handleArp = () => {
    arpeggiateSelectedNotes(
      settings.arpPattern,
      settings.arpStepTicks,
      settings.arpRepeatCount,
      settings.arpReplaceOriginals,
    );
  };

  return (
    <div className="inspector-panel">
      <div className="inspector-header">검사기</div>

      <div className="inspector-section">
        <div className="inspector-label">프로젝트</div>
        <div className="inspector-value">{project.name}</div>
      </div>

      <div className="inspector-section">
        <div className="inspector-label">활성 트랙</div>
        <div className="inspector-value">{activeTrack?.name ?? '—'}</div>
      </div>

      <div className="inspector-section">
        <div className="inspector-label">노트</div>
        <div className="inspector-value">{activeTrack?.notes.length ?? 0}</div>
      </div>

      {hasSelection && (
        <div className="inspector-section">
          <div className="inspector-label">선택됨</div>
          <div className="inspector-value">노트 {selectedNotes.length}개</div>
        </div>
      )}

      {/* ── Note properties (single selection = full edit; multi = bulk only) ── */}
      {selectedNotes.length === 1 && activeTrack && (
        <div className="inspector-section column">
          <div className="inspector-label">노트 속성</div>
          {(() => {
            const n = selectedNotes[0];
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 4, fontSize: 11 }}>
                <span>음높이</span>
                <input
                  type="number" min={0} max={127} value={n.pitch}
                  onChange={(e) => updateNote(activeTrack.id, n.id, { pitch: Math.max(0, Math.min(127, Number(e.target.value))) })}
                  className="inspector-btn"
                />
                <span>시작</span>
                <input
                  type="number" min={0} step={1} value={n.startTick}
                  onChange={(e) => updateNote(activeTrack.id, n.id, { startTick: Math.max(0, Number(e.target.value)) })}
                  className="inspector-btn"
                />
                <span>길이</span>
                <input
                  type="number" min={1} step={1} value={n.durationTicks}
                  onChange={(e) => updateNote(activeTrack.id, n.id, { durationTicks: Math.max(1, Number(e.target.value)) })}
                  className="inspector-btn"
                />
                <span>세기</span>
                <input
                  type="number" min={1} max={127} value={n.velocity}
                  onChange={(e) => updateNote(activeTrack.id, n.id, { velocity: Math.max(1, Math.min(127, Number(e.target.value))) })}
                  className="inspector-btn"
                />
              </div>
            );
          })()}
        </div>
      )}

      {selectedNotes.length > 1 && (
        <div className="inspector-section column">
          <div className="inspector-label">일괄 편집</div>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 4, fontSize: 11 }}>
            <span>세기 →</span>
            <input
              type="number" min={1} max={127} placeholder="모두 설정"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = Math.max(1, Math.min(127, Number((e.target as HTMLInputElement).value)));
                  setVelocityForSelectedNotes(v);
                }
              }}
              className="inspector-btn"
            />
          </div>
        </div>
      )}

      {/* ── Velocity tools (random / scale / mute / color) ───────────── */}
      {hasSelection && (
        <div className="inspector-section column">
          <div className="inspector-label">세기 도구</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="inspector-btn" onClick={() => randomizeVelocitySelectedNotes(settings.randomVelMin, settings.randomVelMax)}>
              랜덤
            </button>
            <input
              type="number" min={1} max={127} value={settings.randomVelMin}
              onChange={(e) => updateSettings({ randomVelMin: Math.max(1, Math.min(127, Number(e.target.value))) })}
              className="inspector-btn" style={{ width: 50 }} title="최소"
            />
            <input
              type="number" min={1} max={127} value={settings.randomVelMax}
              onChange={(e) => updateSettings({ randomVelMax: Math.max(1, Math.min(127, Number(e.target.value))) })}
              className="inspector-btn" style={{ width: 50 }} title="최대"
            />
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="inspector-btn" onClick={() => scaleVelocitySelectedNotes(settings.scaleVelocityAmount)}>
              스케일
            </button>
            <input
              type="number" min={0} max={2} step={0.05} value={settings.scaleVelocityAmount}
              onChange={(e) => updateSettings({ scaleVelocityAmount: Math.max(0, Math.min(2, Number(e.target.value))) })}
              className="inspector-btn" style={{ width: 70 }} title="배율"
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="inspector-btn" onClick={muteSelectedNotes}>음소거</button>
            <button className="inspector-btn" onClick={unmuteSelectedNotes}>해제</button>
          </div>
          <div>
            <div className="inspector-label" style={{ fontSize: 10, marginBottom: 4 }}>색상 그룹</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
              {NOTE_COLOR_GROUPS.map((c, idx) => (
                <button
                  key={idx}
                  onClick={() => setColorGroupForSelectedNotes(idx)}
                  title={idx === 0 ? '트랙 색 사용' : `그룹 ${idx}`}
                  style={{
                    width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
                    background: idx === 0 ? 'transparent' : c,
                    border: idx === 0 ? '1px dashed var(--border)' : '1px solid var(--border)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="inspector-divider" />

      {/* ── Strum ─────────────────────────────────────────────────────── */}
      <div className="inspector-section column">
        <div className="inspector-label">스트럼</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={settings.strumDirection}
            onChange={(e) => updateSettings({ strumDirection: e.target.value as StrumDirection })}
            className="inspector-btn"
            style={{ flex: 1, padding: '4px 6px' }}
          >
            <option value="down">↓ 하행</option>
            <option value="up">↑ 상행</option>
          </select>
          <input
            type="number"
            min={0}
            step={5}
            value={settings.strumAmountTicks}
            onChange={(e) => updateSettings({ strumAmountTicks: Math.max(0, Number(e.target.value)) })}
            className="inspector-btn"
            style={{ width: 60 }}
            title="총 벌어지는 ticks"
          />
        </div>
        <button className="inspector-btn" onClick={handleStrum} disabled={selectedNotes.length < 2}>
          스트럼 적용
        </button>
      </div>

      <div className="inspector-divider" />

      {/* ── Arpeggiate ────────────────────────────────────────────────── */}
      <div className="inspector-section column">
        <div className="inspector-label">아르페지오</div>
        <select
          value={settings.arpPattern}
          onChange={(e) => updateSettings({ arpPattern: e.target.value as ArpPattern })}
          className="inspector-btn"
          style={{ padding: '4px 6px' }}
        >
          {ARP_PATTERNS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="inspector-label" style={{ width: 40 }}>간격</span>
          <input
            type="number"
            min={1}
            step={10}
            value={settings.arpStepTicks}
            onChange={(e) => updateSettings({ arpStepTicks: Math.max(1, Number(e.target.value)) })}
            className="inspector-btn"
            style={{ width: 60 }}
            title="노트 사이 간격 (ticks)"
          />
          <span className="inspector-label" style={{ width: 40 }}>×</span>
          <input
            type="number"
            min={1}
            step={1}
            value={settings.arpRepeatCount}
            onChange={(e) => updateSettings({ arpRepeatCount: Math.max(1, Number(e.target.value)) })}
            className="inspector-btn"
            style={{ width: 50 }}
            title="반복 횟수"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={settings.arpReplaceOriginals}
            onChange={(e) => updateSettings({ arpReplaceOriginals: e.target.checked })}
          />
          원본 코드 노트 대체
        </label>
        <button className="inspector-btn" onClick={handleArp} disabled={!hasSelection}>
          아르페지오 적용
        </button>
      </div>

      <div className="inspector-divider" />

      <div className="inspector-section column">
        <button className="inspector-btn" onClick={handleExport}>JSON 저장</button>
        <button className="inspector-btn" onClick={handleImport}>JSON 불러오기</button>
      </div>
    </div>
  );
};
