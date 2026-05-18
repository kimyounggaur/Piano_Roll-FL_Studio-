import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  isWebMidiSupported, isSecureContextOk, isAccessGranted,
  requestAccess, listInputs, subscribe, subscribeDeviceList,
  setActiveInput, getActiveInputId,
  type MidiDeviceInfo,
} from '../../midi/webMidi';
import { previewNote, initAudio } from '../../audio/toneEngine';

export const MidiInputPanel: React.FC = () => {
  const isRecording        = useProjectStore((s) => s.isRecording);
  const setRecording       = useProjectStore((s) => s.setRecording);
  const recordingScaleSnap = useProjectStore((s) => s.recordingScaleSnap);
  const setRecScaleSnap    = useProjectStore((s) => s.setRecordingScaleSnap);
  const recordedNoteOn     = useProjectStore((s) => s.recordedNoteOn);
  const recordedNoteOff    = useProjectStore((s) => s.recordedNoteOff);

  const [granted, setGranted] = useState<boolean>(isAccessGranted());
  const [devices, setDevices] = useState<MidiDeviceInfo[]>(listInputs());
  const [activeId, setLocalActive] = useState<string | null>(getActiveInputId());
  const [error, setError] = useState<string | null>(null);

  // ── Subscribe to device list updates (hot-plug) ─────────────────
  useEffect(() => {
    const unsub = subscribeDeviceList(setDevices);
    return unsub;
  }, []);

  // ── Subscribe to MIDI events: preview + record ──────────────────
  useEffect(() => {
    const unsub = subscribe((e) => {
      if (e.type === 'noteOn') {
        // Audio thumbnail — keep short so paddle-fast chord input doesn't
        // accumulate long-tailed voices.
        previewNote(e.pitch, e.velocity, 250);
        recordedNoteOn(e.pitch, e.velocity);
      } else if (e.type === 'noteOff') {
        recordedNoteOff(e.pitch);
      }
      // sustain pedal events are ignored at MVP — see webMidi.ts TODO.
    });
    return unsub;
  }, [recordedNoteOn, recordedNoteOff]);

  // ── Permission request ──────────────────────────────────────────
  const onRequest = async () => {
    setError(null);
    try {
      await initAudio();             // gesture-tied audio init
      const list = await requestAccess();
      setGranted(true);
      setDevices(list);
      if (list[0]) {
        setActiveInput(list[0].id);
        setLocalActive(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '권한 요청 실패');
    }
  };

  // ─────────────────────────────────────────────────────────────────
  //  Fallback when Web MIDI is unavailable
  // ─────────────────────────────────────────────────────────────────
  if (!isWebMidiSupported()) {
    return (
      <div style={panelStyle}>
        <h3 style={headingStyle}>MIDI 입력</h3>
        <p style={dimText}>
          현재 브라우저는 Web MIDI를 지원하지 않습니다. Chrome, Edge, 또는 최신 Safari를 사용해 보세요.
        </p>
      </div>
    );
  }

  if (!isSecureContextOk()) {
    return (
      <div style={panelStyle}>
        <h3 style={headingStyle}>MIDI 입력</h3>
        <p style={dimText}>
          Web MIDI는 HTTPS 또는 localhost 환경에서만 동작합니다. 보안 컨텍스트로 다시 접속해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <h3 style={headingStyle}>MIDI 입력</h3>

      {!granted ? (
        <>
          <p style={dimText}>키보드/패드 등 MIDI 장치를 사용하려면 접근 권한이 필요합니다.</p>
          <button onClick={onRequest} style={buttonStyle}>MIDI 접근 권한 요청</button>
        </>
      ) : (
        <>
          <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>입력 장치</label>
          <select
            value={activeId ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              setActiveInput(v);
              setLocalActive(v);
            }}
            style={selectStyle}
            disabled={devices.length === 0}
          >
            {devices.length === 0 && <option value="">연결된 장치 없음</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.manufacturer ? ` (${d.manufacturer})` : ''}{d.state === 'disconnected' ? ' — 연결 해제됨' : ''}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setRecording(!isRecording)}
              style={{
                ...buttonStyle,
                background: isRecording ? '#d03238' : '#9fe870',
                color: isRecording ? '#fff' : '#163300',
              }}
            >
              {isRecording ? '● 녹음 중 (중지)' : '● 녹음 시작'}
            </button>
            <label style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={recordingScaleSnap}
                onChange={(e) => setRecScaleSnap(e.target.checked)}
              /> 스케일 스냅
            </label>
          </div>
          <p style={{ ...dimText, marginTop: 8 }}>
            녹음 중에는 입력된 노트의 startTick이 현재 playhead 기준으로 기록됩니다.
          </p>
        </>
      )}

      {error && <div role="alert" style={errorStyle}>{error}</div>}
    </div>
  );
};

// ── styles ─────────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: '#0e0f0c', color: '#e8ebe6', padding: 12, borderRadius: 6,
  border: '1px solid #2b2c28', fontSize: 13,
};
const headingStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 14, color: '#9fe870' };
const dimText: React.CSSProperties = { fontSize: 12, color: '#9aa399', margin: '4px 0 8px' };
const buttonStyle: React.CSSProperties = {
  padding: '6px 10px', background: '#9fe870', color: '#163300',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const selectStyle: React.CSSProperties = {
  width: '100%', padding: 4, background: '#16170f', color: '#e8ebe6',
  border: '1px solid #2b2c28', borderRadius: 4, fontSize: 12,
};
const errorStyle: React.CSSProperties = {
  marginTop: 8, padding: 8, background: 'rgba(208,50,56,0.15)',
  border: '1px solid #d03238', borderRadius: 4, color: '#ffb2b5', fontSize: 12,
};
