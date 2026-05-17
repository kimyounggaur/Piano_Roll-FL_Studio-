import React from 'react';
import { TransportBar } from '../transport/TransportBar';
import { TrackPanel } from '../panels/TrackPanel';
import { InspectorPanel } from '../panels/InspectorPanel';
import { PianoRoll } from '../pianoRoll/PianoRoll';
import './AppShell.css';

export const AppShell: React.FC = () => {
  return (
    <div className="app-shell">
      <TransportBar />
      <div className="app-body">
        <TrackPanel />
        <PianoRoll />
        <InspectorPanel />
      </div>
    </div>
  );
};
