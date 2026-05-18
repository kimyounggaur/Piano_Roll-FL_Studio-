import React, { useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { importMidi, exportMidi, downloadBlob } from '../../utils/midiFile';
import { deserializeProject, projectToBlob } from '../../utils/projectSerialization';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const onExport = () => {
    setError(null);
    const totalNotes = project.tracks.reduce((acc, t) => acc + t.notes.length, 0);
    if (totalNotes === 0) {
      setError('프로젝트에 노트가 없어 내보낼 수 없습니다.');
      return;
    }
    try {
      const { blob, fileName } = exportMidi(project, { excludeMutedNotes, excludeMutedTracks });
      downloadBlob(blob, fileName);
    } catch (err) {
      console.error(err);
      setError(`MIDI 내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
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
        <button onClick={onExport} style={buttonStyle}>
          .mid 파일로 저장
        </button>
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
  background: '#0e0f0c', color: '#e8ebe6', padding: 12, borderRadius: 6,
  border: '1px solid #2b2c28', fontSize: 13,
};
const headingStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 14, color: '#9fe870' };
const subHeadingStyle: React.CSSProperties = { margin: '8px 0 6px', fontSize: 12, color: '#cdffad' };
const sectionStyle: React.CSSProperties   = { marginBottom: 12 };
const rowStyle: React.CSSProperties       = { display: 'flex', gap: 12, marginBottom: 6 };
const buttonStyle: React.CSSProperties = {
  marginTop: 6, padding: '6px 10px', background: '#9fe870', color: '#163300',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const errorStyle: React.CSSProperties = {
  marginTop: 8, padding: 8, background: 'rgba(208,50,56,0.15)',
  border: '1px solid #d03238', borderRadius: 4, color: '#ffb2b5', fontSize: 12,
};
