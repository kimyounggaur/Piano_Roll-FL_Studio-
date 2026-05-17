import React, { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import './InspectorPanel.css';

export const InspectorPanel: React.FC = () => {
  const { project, exportJSON, importJSON } = useProjectStore();
  const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
  const selectedNotes = activeTrack?.notes.filter((n) => n.selected) ?? [];

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

      {selectedNotes.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">선택됨</div>
          <div className="inspector-value">노트 {selectedNotes.length}개</div>
        </div>
      )}

      <div className="inspector-divider" />

      <div className="inspector-section column">
        <button className="inspector-btn" onClick={handleExport}>JSON 저장</button>
        <button className="inspector-btn" onClick={handleImport}>JSON 불러오기</button>
      </div>
    </div>
  );
};
