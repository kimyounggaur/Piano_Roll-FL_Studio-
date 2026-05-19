import React, { useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { importMidi, exportMidi, downloadBlob } from '../../utils/midiFile';
import { exportMusicXml, exportMxl } from '../../utils/musicXmlFile';
import { deserializeProject, projectToBlob } from '../../utils/projectSerialization';
import { NOTE_COLOR_GROUPS } from '../../types/music';
import { countExportableNotes, getUsedColorGroups } from '../../utils/exportFilters';

type ImportMode = 'replace' | 'append';

export const ImportExportPanel: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const importMidiAction = useProjectStore((s) => s.importMidi);
  const replaceProject = useProjectStore((s) => s.replaceProject);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [excludeMutedNotes, setExcludeMutedNotes] = useState(true);
  const [excludeMutedTracks, setExcludeMutedTracks] = useState(true);
  // null = all colors; otherwise: set of group indices (0..15)
  const [colorFilter, setColorFilter] = useState<Set<number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleColorGroup = (idx: number) => {
    setColorFilter((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next.size === 0 ? null : next;
    });
  };

  const exportOpts = () => ({
    excludeMutedNotes,
    excludeMutedTracks,
    colorGroups: colorFilter ? Array.from(colorFilter) : undefined,
  });

  const baseExportOpts = { excludeMutedNotes, excludeMutedTracks };
  const currentExportOpts = exportOpts();
  const exportableCount = countExportableNotes(project, currentExportOpts);
  const usedColorGroups = getUsedColorGroups(project, baseExportOpts);

  const guardHasExportableNotes = (
    opts = currentExportOpts,
    emptyMessage = '현재 내보내기 조건에 맞는 노트가 없습니다.',
  ): boolean => {
    if (countExportableNotes(project, opts) === 0) {
      setError(emptyMessage);
      return false;
    }
    return true;
  };

  /** One-click "export only this color" — bypasses the multi-select filter. */
  const exportSingleColor = (
    group: number,
    kind: 'mid' | 'musicxml' | 'mxl',
  ) => {
    setError(null);
    const opts = {
      excludeMutedNotes,
      excludeMutedTracks,
      colorGroups: [group],
      fileName: `${defaultBase()}-color${group}`,
    };
    if (!guardHasExportableNotes(opts, `색상 ${group}에 내보낼 수 있는 노트가 없습니다.`)) return;
    try {
      const { blob, fileName } =
        kind === 'mid'      ? exportMidi(project, opts)      :
        kind === 'musicxml' ? exportMusicXml(project, opts)  :
                              exportMxl(project, opts);
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error(err);
      setError(`색상 ${group} 내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  //  Import
  // ─────────────────────────────────────────────────────────────────
  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting same file
    if (!file) return;
    if (!/\.midi?$/i.test(file.name)) {
      setError('지원하지 않는 파일 형식입니다. .mid 또는 .midi 파일을 선택하세요.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const imported = importMidi(buf);
      if (imported.tracks.length === 0) {
        setError('가져올 수 있는 노트가 없습니다 (모든 트랙이 비어 있음).');
        return;
      }
      importMidiAction(imported, mode);
    } catch (err) {
      console.error(err);
      setError(`MIDI 파일을 읽지 못했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setBusy(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  //  Export
  // ─────────────────────────────────────────────────────────────────
  const onExportMidi = () => {
    setError(null);
    if (!guardHasExportableNotes()) return;
    try {
      const { blob, fileName } = exportMidi(project, exportOpts());
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error(err);
      setError(`MIDI 내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  const onExportMusicXml = () => {
    setError(null);
    if (!guardHasExportableNotes()) return;
    try {
      const { blob, fileName } = exportMusicXml(project, exportOpts());
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error(err);
      setError(`MusicXML 내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  const onExportMxl = () => {
    setError(null);
    if (!guardHasExportableNotes()) return;
    try {
      const { blob, fileName } = exportMxl(project, exportOpts());
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error(err);
      setError(`MXL 내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  return (
    <div style={panelStyle}>
      <h3 style={headingStyle}>MIDI 가져오기 / 내보내기</h3>

      {/* ── Import ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h4 style={subHeadingStyle}>가져오기</h4>
        <div style={rowStyle}>
          <label style={{ fontSize: 12 }}>
            <input
              type="radio" name="import-mode"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
            /> 기존 트랙에 추가
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="radio" name="import-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            /> 덮어쓰기
          </label>
        </div>
        <input
          ref={fileInputRef}
          type="file" accept=".mid,.midi,audio/midi"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <button onClick={onPickFile} disabled={busy} style={buttonStyle}>
          {busy ? '읽는 중…' : 'MIDI 파일 선택'}
        </button>
      </section>

      {/* ── Export ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h4 style={subHeadingStyle}>내보내기</h4>
        <label style={{ fontSize: 12, display: 'block' }}>
          <input
            type="checkbox"
            checked={excludeMutedNotes}
            onChange={(e) => setExcludeMutedNotes(e.target.checked)}
          /> 음소거된 노트 제외
        </label>
        <label style={{ fontSize: 12, display: 'block' }}>
          <input
            type="checkbox"
            checked={excludeMutedTracks}
            onChange={(e) => setExcludeMutedTracks(e.target.checked)}
          /> 음소거된 트랙 제외
        </label>

        {/* ── Color-group filter ─────────────────────────────────── */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--text-primary)' }}>
            색상 그룹 필터
            <button
              type="button"
              onClick={() => setColorFilter(null)}
              style={{
                marginLeft: 8, padding: '0 6px', fontSize: 10,
                background: 'transparent', color: 'var(--accent)',
                border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
              }}
              title="필터 해제 — 모든 색 내보내기"
            >
              모두
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            {colorFilter === null
              ? `내보낼 노트 ${exportableCount}개`
              : colorFilter.size === 0
                ? '(선택 없음 — 결과가 비어 있을 수 있음)'
                : `선택 색상 노트 ${exportableCount}개`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {NOTE_COLOR_GROUPS.map((c, idx) => {
              const active = colorFilter?.has(idx) ?? false;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleColorGroup(idx)}
                  title={idx === 0 ? '그룹 없음 (트랙 색)' : `그룹 ${idx}`}
                  style={{
                    width: '100%', height: 20, borderRadius: 4, cursor: 'pointer',
                    background: idx === 0 ? 'transparent' : c,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    outline: idx === 0 && active ? '1px dashed var(--accent)' : 'none',
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <button onClick={onExportMidi} style={buttonStyle} disabled={exportableCount === 0}>
            .mid로 저장
          </button>
          <button onClick={onExportMusicXml} style={buttonStyle} disabled={exportableCount === 0}>
            .musicxml로 저장
          </button>
          <button onClick={onExportMxl} style={buttonStyle} disabled={exportableCount === 0}>
            .mxl로 저장
          </button>
        </div>

        {/* ── Per-color one-click export ──────────────────────────────────
            For every color group that actually appears in the project,
            this row offers three direct-download buttons that bypass the
            multi-select filter above.  This is the fastest way to
            "동일 색상 노트만 내보내기" — one click → one file. */}
        {usedColorGroups.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-primary)' }}>
              색상별 빠른 내보내기
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {usedColorGroups.map(({ group, count }) => (
                <div
                  key={group}
                  style={quickExportRowStyle}
                >
                  <div style={quickExportInfoStyle}>
                    <span
                      style={{
                        width: 16, height: 16, borderRadius: 4, flex: '0 0 16px',
                        background: group === 0 ? 'transparent' : NOTE_COLOR_GROUPS[group],
                        border: '1px solid var(--border)',
                        display: 'inline-block',
                      }}
                      title={group === 0 ? '그룹 없음 (트랙 색)' : `그룹 ${group}`}
                    />
                    <span style={quickExportLabelStyle}>
                      {group === 0 ? '그룹 없음' : `그룹 ${group}`} · 노트 {count}개
                    </span>
                  </div>
                  <div style={quickExportActionsStyle}>
                    <button
                      onClick={() => exportSingleColor(group, 'mid')}
                      style={smallButtonStyle}
                      title="이 색상의 노트만 .mid로 저장"
                    >.mid</button>
                    <button
                      onClick={() => exportSingleColor(group, 'musicxml')}
                      style={smallButtonStyle}
                      title="이 색상의 노트만 .musicxml로 저장"
                    >.xml</button>
                    <button
                      onClick={() => exportSingleColor(group, 'mxl')}
                      style={smallButtonStyle}
                      title="이 색상의 노트만 .mxl로 저장"
                    >.mxl</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Project JSON save/load ─────────────────────────────── */}
      <section style={sectionStyle}>
        <h4 style={subHeadingStyle}>프로젝트 파일 (.json)</h4>
        <input
          ref={jsonInputRef}
          type="file" accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setError(null);
            try {
              const text = await file.text();
              const restored = deserializeProject(text);
              replaceProject(restored);
            } catch (err) {
              setError(err instanceof Error ? err.message : '프로젝트를 불러오지 못했습니다.');
            }
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => jsonInputRef.current?.click()} style={buttonStyle}>
            JSON 불러오기
          </button>
          <button
            onClick={() => {
              setError(null);
              try {
                const { blob, fileName } = projectToBlob(project);
                downloadBlob(blob, fileName);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'JSON 저장 실패');
              }
            }}
            style={buttonStyle}
          >
            JSON으로 저장
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" style={errorStyle}>{error}</div>
      )}
    </div>
  );
};

// ── inline styles to keep this self-contained ────────────────────────
const panelStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: 12, borderRadius: 6,
  border: '1px solid var(--border)', fontSize: 13,
};
const headingStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 14, color: 'var(--lavender)' };
const subHeadingStyle: React.CSSProperties = { margin: '8px 0 6px', fontSize: 12, color: 'var(--text-primary)' };
const sectionStyle: React.CSSProperties   = { marginBottom: 12 };
const rowStyle: React.CSSProperties       = { display: 'flex', gap: 12, marginBottom: 6 };
const buttonStyle: React.CSSProperties = {
  marginTop: 6, padding: '6px 10px', background: 'var(--accent)', color: 'var(--accent-dark)',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const smallButtonStyle: React.CSSProperties = {
  minWidth: 42, minHeight: 26, padding: '3px 7px', fontSize: 10, background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', border: '1px solid var(--border)',
  borderRadius: 4, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
};
const quickExportRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 5,
  padding: '6px 7px',
  background: 'color-mix(in srgb, var(--bg-surface) 72%, transparent)',
  border: '1px solid var(--border)',
  borderRadius: 5,
};
const quickExportInfoStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};
const quickExportLabelStyle: React.CSSProperties = {
  minWidth: 0,
  fontSize: 11,
  lineHeight: 1.3,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  wordBreak: 'keep-all',
};
const quickExportActionsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 5,
};

function defaultBase(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rolllab-project-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const errorStyle: React.CSSProperties = {
  marginTop: 8, padding: 8, background: 'color-mix(in srgb, var(--danger) 16%, transparent)',
  border: '1px solid var(--danger)', borderRadius: 4, color: 'var(--danger)', fontSize: 12,
};
