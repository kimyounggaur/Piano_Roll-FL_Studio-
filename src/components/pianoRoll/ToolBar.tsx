import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { EditTool } from '../../types/music';
import './ToolBar.css';

const TOOLS: { id: EditTool; label: string; icon: string; title: string }[] = [
  { id: 'draw',   label: 'Draw',   icon: '✏️', title: 'Draw notes (D)' },
  { id: 'select', label: 'Select', icon: '▣',  title: 'Select notes (S)' },
  { id: 'erase',  label: 'Erase',  icon: '⌫',  title: 'Erase notes (E)' },
];

export const ToolBar: React.FC = () => {
  const { activeTool, setActiveTool, project, updateSettings } = useProjectStore();
  const { settings } = project;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn${activeTool === t.id ? ' active' : ''}`}
            onClick={() => setActiveTool(t.id)}
            title={t.title}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <span className="toolbar-label">Scale</span>
        <select
          value={settings.scaleName}
          onChange={(e) => updateSettings({ scaleName: e.target.value })}
          className="toolbar-select"
        >
          {['none','major','minor','dorian','phrygian','lydian','mixolydian','pentatonic','blues'].map(
            (s) => <option key={s} value={s}>{s === 'none' ? 'No Scale' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          )}
        </select>
        <select
          value={settings.scaleRoot}
          onChange={(e) => updateSettings({ scaleRoot: Number(e.target.value) })}
          className="toolbar-select"
          disabled={settings.scaleName === 'none'}
        >
          {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
