import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { AutomationCanvas } from './AutomationCanvas';
import { ModulationMatrix } from './ModulationMatrix';
import { ParameterBrowser } from './ParameterBrowser';
import { interpolateAutomation } from '../../utils/automationUtils';
import type { AutomationLane, AutomationRecordMode } from '../../types/music';
import './AutomationPanel.css';

type AutoTool = 'select' | 'draw' | 'linear' | 'step' | 'smooth' | 'erase';
type PanelTab  = 'curves' | 'modulation';

const EMPTY_LANES: AutomationLane[] = [];

const TOOL_DEFS: { id: AutoTool; label: string }[] = [
  { id: 'select', label: '▲ 선택' },
  { id: 'draw',   label: '✏ 그리기' },
  { id: 'linear', label: '╱ 직선' },
  { id: 'step',   label: '┐ 계단' },
  { id: 'smooth', label: '~ 곡선' },
  { id: 'erase',  label: '⌫ 지우개' },
];

const REC_MODES: { id: AutomationRecordMode; label: string; cls: string }[] = [
  { id: 'write', label: 'W', cls: 'write' },
  { id: 'touch', label: 'T', cls: 'touch' },
  { id: 'latch', label: 'L', cls: 'latch' },
];

interface LaneHeaderProps {
  lane: AutomationLane;
  trackName: string;
  currentValue: number;
}

const LaneHeader: React.FC<LaneHeaderProps> = ({ lane, trackName, currentValue }) => {
  const removeAutomationLane  = useProjectStore((s) => s.removeAutomationLane);
  const setAutomationRecordMode = useProjectStore((s) => s.setAutomationRecordMode);
  const toggleAutomationLane  = useProjectStore((s) => s.toggleAutomationLane);

  const formattedValue = `${currentValue.toFixed(2)} ${lane.unit}`;

  return (
    <div className="automation-lane-header">
      <div className="lane-ctrl-btns">
        <button
          className={`lane-ctrl-btn${!lane.visible ? ' disabled' : ''}`}
          title={lane.visible ? '숨기기' : '표시'}
          onClick={() => {
            const updStore = useProjectStore.getState();
            updStore.automationLanes
              .filter((l) => l.id === lane.id)
              .forEach(() => {/* visibility toggle via enabled */});
            toggleAutomationLane(lane.id);
          }}
        >
          {lane.visible ? '👁' : '—'}
        </button>
        <button
          className="lane-ctrl-btn"
          title="레인 삭제"
          onClick={() => removeAutomationLane(lane.id)}
          style={{ color: '#d03238' }}
        >
          ×
        </button>
      </div>

      <div className="lane-header-top">
        <span className="lane-color-dot" style={{ background: lane.color }} />
        <span className="lane-param-name">{lane.parameterName}</span>
      </div>
      <div className="lane-track-name">{trackName}</div>
      <div className="lane-value-display">{formattedValue}</div>

      <div className="lane-record-btns">
        {REC_MODES.map((m) => (
          <button
            key={m.id}
            className={`lane-rec-btn${lane.recordMode === m.id ? ` ${m.cls}` : ''}`}
            onClick={() => setAutomationRecordMode(lane.id, lane.recordMode === m.id ? 'off' : m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const AutomationPanel: React.FC = () => {
  const automationLanes = useProjectStore((s) => s.automationLanes ?? EMPTY_LANES);
  const tracks          = useProjectStore((s) => s.project.tracks);
  const viewport        = useProjectStore((s) => s.viewport);
  const playheadTick    = useProjectStore((s) => s.playheadTick);
  const isPlaying       = useProjectStore((s) => s.isPlaying);
  const addAutomationPoint = useProjectStore((s) => s.addAutomationPoint);

  const [tool, setTool]        = useState<AutoTool>('draw');
  const [panelTab, setPanelTab] = useState<PanelTab>('curves');
  const [showParamBrowser, setShowParamBrowser] = useState(false);
  const [laneHeights] = useState<Record<string, number>>({});

  const { scrollX, pixelsPerTick } = viewport;

  // Compute PPQ-based ticks per bar from settings
  const settings    = useProjectStore((s) => s.project.settings);
  const ticksPerBar = (settings.ppq ?? 480) * (settings.timeSignature?.numerator ?? 4);

  // ── Recording loop ───────────────────────────────────────────────
  const recFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying) {
      if (recFrameRef.current !== null) cancelAnimationFrame(recFrameRef.current);
      return;
    }
    const recordingLanes = automationLanes.filter((l) => l.recordMode !== 'off');
    if (recordingLanes.length === 0) return;
    const loop = () => {
      const tick = useProjectStore.getState().playheadTick;
      for (const lane of recordingLanes) {
        addAutomationPoint(lane.id, { tick: Math.round(tick), value: lane.defaultValue / (lane.maxValue - lane.minValue || 1), curveType: 'linear' });
      }
      recFrameRef.current = requestAnimationFrame(loop);
    };
    recFrameRef.current = requestAnimationFrame(loop);
    return () => { if (recFrameRef.current !== null) cancelAnimationFrame(recFrameRef.current); };
  }, [isPlaying, automationLanes, addAutomationPoint]);

  const LANE_H = 120;

  return (
    <div className="automation-panel">
      {/* ── Toolbar ── */}
      <div className="automation-toolbar">
        {TOOL_DEFS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn${tool === t.id ? ' active' : ''}`}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="divider" />
        <div className="automation-tab-group">
          <button className={`automation-tab${panelTab === 'curves' ? ' active' : ''}`} onClick={() => setPanelTab('curves')}>커브 편집</button>
          <button className={`automation-tab${panelTab === 'modulation' ? ' active' : ''}`} onClick={() => setPanelTab('modulation')}>모듈레이션</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="automation-body">
        {panelTab === 'modulation' ? (
          <ModulationMatrix />
        ) : (
          <div className="automation-lanes-area">
            {automationLanes.length === 0 && (
              <div style={{ padding: 24, color: '#9aa399', fontSize: 13, textAlign: 'center' }}>
                아직 오토메이션 레인이 없습니다.<br />아래 버튼으로 파라미터를 추가하세요.
              </div>
            )}

            {automationLanes.map((lane) => {
              const track = tracks.find((t) => t.id === lane.trackId);
              const h     = laneHeights[lane.id] ?? LANE_H;
              const currentValue = interpolateAutomation(lane, playheadTick);

              return (
                <div
                  key={lane.id}
                  className="automation-lane-row"
                  style={{ height: h, opacity: lane.visible ? 1 : 0.35 }}
                >
                  <LaneHeader
                    lane={lane}
                    trackName={track?.name ?? '—'}
                    currentValue={currentValue}
                  />
                  <AutomationCanvas
                    lane={lane}
                    tool={tool}
                    width={Math.max(800, viewport.width - 200)}
                    height={h}
                    scrollX={scrollX}
                    pixelsPerTick={pixelsPerTick}
                    ticksPerBar={ticksPerBar}
                  />
                </div>
              );
            })}

            {/* Add lane row */}
            <div className="add-lane-row" style={{ position: 'relative' }}>
              <button onClick={() => setShowParamBrowser((v) => !v)}>
                + 파라미터 추가
              </button>
              {showParamBrowser && (
                <div style={{ position: 'absolute', bottom: 32, left: 0, zIndex: 100 }}>
                  <ParameterBrowser onClose={() => setShowParamBrowser(false)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
