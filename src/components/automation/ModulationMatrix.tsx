import React, { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { ModulationMapping } from '../../types/music';

const EMPTY_MODULATION: ModulationMapping[] = [];
const EMPTY_LANES: import('../../types/music').AutomationLane[] = [];

const SOURCE_LABELS: Record<ModulationMapping['sourceType'], string> = {
  lfo:      'LFO 1',
  envelope: '엔벨로프',
  'midi-cc':'MIDI CC7',
  velocity: '벨로시티',
  keytrack: '키트랙',
};

function LfoPreview({ color }: { color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width  = 32;
    c.height = 16;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 32, 16);
    ctx.beginPath();
    ctx.strokeStyle = color + '80';
    ctx.lineWidth   = 1.5;
    for (let x = 0; x <= 32; x++) {
      const y = 8 - Math.sin((x / 32) * Math.PI * 2) * 6;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [color]);
  return <canvas ref={ref} className="lfo-preview" />;
}

export const ModulationMatrix: React.FC = () => {
  const modulationMappings = useProjectStore((s) => s.modulationMappings ?? EMPTY_MODULATION);
  const automationLanes    = useProjectStore((s) => s.automationLanes ?? EMPTY_LANES);
  const addMapping         = useProjectStore((s) => s.addModulationMapping);
  const removeMapping      = useProjectStore((s) => s.removeModulationMapping);
  const updateMapping      = useProjectStore((s) => s.updateModulationMapping);

  return (
    <div className="modulation-matrix">
      <h3>모듈레이션 매트릭스</h3>
      <button
        className="add-mapping-btn"
        onClick={() => addMapping({
          sourceType: 'lfo',
          sourceId:   'lfo-1',
          targetLaneId: automationLanes[0]?.id ?? '',
          depth: 0.5,
          enabled: true,
        })}
      >
        + 추가
      </button>

      {modulationMappings.map((m) => {
        const targetLane = automationLanes.find((l) => l.id === m.targetLaneId);
        return (
          <div key={m.id} className={`modulation-row${m.enabled ? '' : ' disabled'}`}>
            {m.sourceType === 'lfo' && <LfoPreview color={targetLane?.color ?? '#9fe870'} />}

            {/* Source */}
            <select
              value={m.sourceType}
              onChange={(e) => updateMapping(m.id, { sourceType: e.target.value as ModulationMapping['sourceType'] })}
            >
              {(Object.keys(SOURCE_LABELS) as ModulationMapping['sourceType'][]).map((k) => (
                <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
              ))}
            </select>

            <span style={{ color: '#9aa399', fontSize: 11 }}>→</span>

            {/* Target */}
            <select
              value={m.targetLaneId}
              onChange={(e) => updateMapping(m.id, { targetLaneId: e.target.value })}
            >
              {automationLanes.length === 0
                ? <option value="">— 레인 없음 —</option>
                : automationLanes.map((l) => <option key={l.id} value={l.id}>{l.parameterName}</option>)
              }
            </select>

            {/* Depth slider */}
            <input
              type="range"
              className="depth-slider"
              min={-1} max={1} step={0.01}
              value={m.depth}
              onChange={(e) => updateMapping(m.id, { depth: Number(e.target.value) })}
            />
            <span className="depth-val">{m.depth >= 0 ? '+' : ''}{m.depth.toFixed(2)}</span>

            <button
              className="lane-ctrl-btn"
              title={m.enabled ? '비활성화' : '활성화'}
              onClick={() => updateMapping(m.id, { enabled: !m.enabled })}
            >
              {m.enabled ? '👁' : '🚫'}
            </button>

            <button className="del-btn" onClick={() => removeMapping(m.id)}>×</button>
          </div>
        );
      })}

      {modulationMappings.length === 0 && (
        <p style={{ fontSize: 12, color: '#9aa399' }}>매핑이 없습니다. "+ 추가"를 클릭하세요.</p>
      )}
    </div>
  );
};
