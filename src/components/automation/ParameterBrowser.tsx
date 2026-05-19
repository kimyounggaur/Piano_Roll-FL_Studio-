import React, { useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { AutomationParameterCategory } from '../../types/music';

interface ParamDef {
  parameterId: string;
  parameterName: string;
  category: AutomationParameterCategory;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  unit: string;
}

const PARAM_DEFS: ParamDef[] = [
  { parameterId: 'volume',      parameterName: 'Volume',      category: 'volume', minValue: 0, maxValue: 2,     defaultValue: 1,   unit: 'dB' },
  { parameterId: 'pan',         parameterName: 'Pan',         category: 'pan',    minValue: -1, maxValue: 1,    defaultValue: 0,   unit: '%' },
  { parameterId: 'pitch',       parameterName: 'Pitch',       category: 'pitch',  minValue: -24, maxValue: 24,  defaultValue: 0,   unit: 'st' },
  { parameterId: 'filter-freq', parameterName: 'Filter Freq', category: 'filter', minValue: 20, maxValue: 20000, defaultValue: 440, unit: 'Hz' },
  { parameterId: 'filter-q',    parameterName: 'Filter Q',    category: 'filter', minValue: 0.1, maxValue: 10, defaultValue: 1,   unit: '' },
  { parameterId: 'reverb-send', parameterName: 'Reverb Send', category: 'reverb', minValue: 0, maxValue: 1,    defaultValue: 0,   unit: '%' },
  { parameterId: 'delay-send',  parameterName: 'Delay Send',  category: 'delay',  minValue: 0, maxValue: 1,    defaultValue: 0,   unit: '%' },
];

const CATEGORY_LABELS: Record<AutomationParameterCategory, string> = {
  volume: '볼륨', pan: '패닝', pitch: '피치',
  filter: '필터', reverb: '리버브', delay: '딜레이', custom: '커스텀',
};

const CATEGORIES: AutomationParameterCategory[] = ['volume', 'pan', 'pitch', 'filter', 'reverb', 'delay'];

interface Props { onClose: () => void }

export const ParameterBrowser: React.FC<Props> = ({ onClose }) => {
  const automationLanes = useProjectStore((s) => s.automationLanes);
  const addLane         = useProjectStore((s) => s.addAutomationLane);
  const activeTrackId   = useProjectStore((s) => s.project.activeTrackId);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const existingParamIds = new Set(
    automationLanes
      .filter((l) => l.trackId === activeTrackId)
      .map((l) => l.parameterId)
  );

  return (
    <div className="param-dropdown" ref={ref} style={{ bottom: 32, left: 0 }}>
      {CATEGORIES.map((cat) => {
        const items = PARAM_DEFS.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <React.Fragment key={cat}>
            <div className="param-category-label">{CATEGORY_LABELS[cat]}</div>
            {items.map((p) => {
              const exists = existingParamIds.has(p.parameterId);
              return (
                <div
                  key={p.parameterId}
                  className={`param-dropdown-item${exists ? ' disabled' : ''}`}
                  onClick={() => {
                    if (exists || !activeTrackId) return;
                    addLane({
                      trackId: activeTrackId,
                      parameterId:   p.parameterId,
                      parameterName: p.parameterName,
                      category:      p.category,
                      minValue:      p.minValue,
                      maxValue:      p.maxValue,
                      defaultValue:  p.defaultValue,
                      unit:          p.unit,
                      color:         '#9fe870',
                      visible:       true,
                      enabled:       true,
                      recordMode:    'off',
                    });
                    onClose();
                  }}
                >
                  <span>{p.parameterName}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9aa399' }}>
                    {exists ? '✓' : p.unit}
                  </span>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
