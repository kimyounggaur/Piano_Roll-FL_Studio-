import React, { useState } from 'react';
import { TransportBar } from '../transport/TransportBar';
import { TrackPanel } from '../panels/TrackPanel';
import { InspectorPanel } from '../panels/InspectorPanel';
import { PianoRoll } from '../pianoRoll/PianoRoll';
import { DrumSequencer } from '../pianoRoll/DrumSequencer';
import { PatternPanel } from '../panels/PatternPanel';
import { GhostChannelPanel } from '../panels/GhostChannelPanel';
import { ImportExportPanel } from '../panels/ImportExportPanel';
import { RestorePrompt } from './RestorePrompt';
import { useAutosave } from '../../hooks/useAutosave';
import { usePerformanceModeReschedule } from '../../hooks/usePerformanceModeReschedule';
import { useProjectStore } from '../../store/projectStore';
import './AppShell.css';

type RightTab = 'inspector' | 'patterns' | 'ghosts' | 'files';

export const AppShell: React.FC = () => {
  useAutosave(1000);
  usePerformanceModeReschedule();

  const activeTrack = useProjectStore((s) =>
    s.project.tracks.find((t) => t.id === s.project.activeTrackId) ?? null
  );
  const isDrum = activeTrack?.trackKind === 'drum';

  const [tab, setTab] = useState<RightTab>('inspector');

  return (
    <div className="app-shell">
      <TransportBar />
      <div className="app-body">
        <TrackPanel />
        {isDrum && activeTrack
          ? <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><DrumSequencer track={activeTrack} bars={2} /></div>
          : <PianoRoll />
        }
        <div style={{ width: 'var(--inspector-w, 240px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {(['inspector', 'patterns', 'ghosts', 'files'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '6px 4px', fontSize: 11,
                  background: tab === t ? 'rgba(159,232,112,0.18)' : 'transparent',
                  color: tab === t ? '#9fe870' : 'var(--text-secondary, #b8bcb5)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {t === 'inspector' ? '검사기' : t === 'patterns' ? '패턴' : t === 'ghosts' ? '고스트' : '파일'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {tab === 'inspector' && <InspectorPanel />}
            {tab === 'patterns'  && <PatternPanel />}
            {tab === 'ghosts'    && <GhostChannelPanel />}
            {tab === 'files'     && <ImportExportPanel />}
          </div>
        </div>
      </div>
      <RestorePrompt />
    </div>
  );
};
