import React from 'react';
import { useProjectStore } from '../../store/projectStore';

interface Props { regionId: string | null; }

export const AudioClipInspector: React.FC<Props> = ({ regionId }) => {
  const audioRegions      = useProjectStore((s) => s.audioRegions);
  const updateAudioRegion = useProjectStore((s) => s.updateAudioRegion);
  const region = audioRegions.find((r) => r.id === regionId) ?? null;

  if (!region) {
    return (
      <div className="audio-inspector">
        <h3>클립 정보</h3>
        <p className="empty-hint">클립을 선택하세요</p>
      </div>
    );
  }

  const gainDb = (region.gain <= 0 ? -Infinity : 20 * Math.log10(region.gain)).toFixed(1);

  return (
    <div className="audio-inspector">
      <h3>클립 정보</h3>

      <div className="inspector-row">
        <label>이름</label>
        <input
          type="text"
          value={region.name}
          onChange={(e) => updateAudioRegion(region.id, { name: e.target.value })}
        />
      </div>

      <div className="inspector-row">
        <label>게인</label>
        <input
          type="range" min={0} max={2} step={0.01}
          value={region.gain}
          onChange={(e) => updateAudioRegion(region.id, { gain: Number(e.target.value) })}
        />
        <span className="val">{gainDb} dB</span>
      </div>

      <div className="inspector-row">
        <label>피치</label>
        <input
          type="range" min={-24} max={24} step={1}
          value={region.pitchSemitones}
          onChange={(e) => updateAudioRegion(region.id, { pitchSemitones: Number(e.target.value) })}
        />
        <span className="val">{region.pitchSemitones > 0 ? '+' : ''}{region.pitchSemitones} st</span>
      </div>

      <div className="inspector-row">
        <label>속도</label>
        <input
          type="range" min={0.5} max={2} step={0.01}
          value={region.timewarpFactor}
          onChange={(e) => updateAudioRegion(region.id, { timewarpFactor: Number(e.target.value) })}
        />
        <span className="val">{region.timewarpFactor.toFixed(2)}×</span>
      </div>

      <div className="inspector-row">
        <label>페이드인</label>
        <input
          type="number" min={0} step={1}
          value={region.fadeInTicks}
          onChange={(e) => updateAudioRegion(region.id, { fadeInTicks: Math.max(0, Number(e.target.value)) })}
        />
        <span className="val">틱</span>
      </div>

      <div className="inspector-row">
        <label>페이드아웃</label>
        <input
          type="number" min={0} step={1}
          value={region.fadeOutTicks}
          onChange={(e) => updateAudioRegion(region.id, { fadeOutTicks: Math.max(0, Number(e.target.value)) })}
        />
        <span className="val">틱</span>
      </div>

      <div className="inspector-toggle-row">
        <button
          className={region.muted ? 'active' : ''}
          onClick={() => updateAudioRegion(region.id, { muted: !region.muted })}
        >
          {region.muted ? '🔇 음소거' : '🔊 활성'}
        </button>
        <button
          className={region.looped ? 'active' : ''}
          onClick={() => updateAudioRegion(region.id, { looped: !region.looped })}
        >
          {region.looped ? '↺ 루프 ON' : '↺ 루프 OFF'}
        </button>
      </div>
    </div>
  );
};
