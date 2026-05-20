import React, { useState } from 'react';
import type { ClipBehindStyle, GridContrast, TimeSegmentUnit } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';

const CONTRASTS: GridContrast[] = ['high', 'medium', 'low'];
const SEGMENTS: TimeSegmentUnit[] = ['bars', 'beats', 'steps', 'markers'];
const CLIP_STYLES: ClipBehindStyle[] = ['nothing', 'plain', 'cel', 'glass', 'aqua', 'solid'];
const HEIGHT_PRESETS = [33, 50, 75, 100, 150, 200];

export const ViewOptionsMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const view = useProjectStore((s) => s.playlistView);
  const setPlaylistView = useProjectStore((s) => s.setPlaylistView);

  return (
    <span className="arrangement-dropdown">
      <button
        className={`arrangement-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="View 메뉴"
      >
        <span className="arrangement-icon-btn__ico" aria-hidden="true">👁</span>
        <span className="arrangement-icon-btn__lbl">보기 ▾</span>
      </button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline arrangement-menu--wide">
          <label>Grid color <input type="color" value={view.gridColor} onChange={(e) => setPlaylistView({ gridColor: e.target.value })} /></label>
          <label>Contrast
            <select value={view.gridContrast} onChange={(e) => setPlaylistView({ gridContrast: e.target.value as GridContrast })}>
              {CONTRASTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Time segment
            <select value={view.timeSegmentUnit} onChange={(e) => setPlaylistView({ timeSegmentUnit: e.target.value as TimeSegmentUnit })}>
              {SEGMENTS.map((segment) => <option key={segment} value={segment}>{segment}</option>)}
            </select>
          </label>
          <label>Clip behind
            <select value={view.clipBehindStyle} onChange={(e) => setPlaylistView({ clipBehindStyle: e.target.value as ClipBehindStyle })}>
              {CLIP_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
            </select>
          </label>
          <label>Track height
            <input type="range" min={33} max={200} value={view.trackHeightPercent} onChange={(e) => setPlaylistView({ trackHeightPercent: Number(e.target.value) })} />
            <span>{view.trackHeightPercent}%</span>
          </label>
          <span className="arrangement-menu__preset-row">
            {HEIGHT_PRESETS.map((p) => <button key={p} onClick={() => setPlaylistView({ trackHeightPercent: p })}>{p}%</button>)}
          </span>
          <div className="arrangement-menu__separator" />
          <label><input type="checkbox" checked={view.invertGrid} onChange={(e) => setPlaylistView({ invertGrid: e.target.checked })} /> 그리드 반전</label>
          <label><input type="checkbox" checked={view.showTrackSeparators} onChange={(e) => setPlaylistView({ showTrackSeparators: e.target.checked })} /> 트랙 구분선</label>
          <label><input type="checkbox" checked={view.keepLabelsOnScreen} onChange={(e) => setPlaylistView({ keepLabelsOnScreen: e.target.checked })} /> 클립 라벨 고정</label>
          <label><input type="checkbox" checked={view.contentInTitleBars} onChange={(e) => setPlaylistView({ contentInTitleBars: e.target.checked })} /> 타이틀바 콘텐츠</label>
          <label><input type="checkbox" checked={view.showShadow} onChange={(e) => setPlaylistView({ showShadow: e.target.checked })} /> 클립 그림자</label>
          <label><input type="checkbox" checked={view.showFadePreviews} onChange={(e) => setPlaylistView({ showFadePreviews: e.target.checked })} /> 페이드 미리보기</label>
          <label><input type="checkbox" checked={view.showGainValue} onChange={(e) => setPlaylistView({ showGainValue: e.target.checked })} /> 게인 값</label>
          <label><input type="checkbox" checked={view.showGainScale} onChange={(e) => setPlaylistView({ showGainScale: e.target.checked })} /> 게인 스케일</label>
          <label><input type="checkbox" checked={view.showGainPreviews} onChange={(e) => setPlaylistView({ showGainPreviews: e.target.checked })} /> 게인 미리보기</label>
          <label><input type="checkbox" checked={view.incrementalScrolling} onChange={(e) => setPlaylistView({ incrementalScrolling: e.target.checked })} /> 증분 스크롤</label>
          <label><input type="checkbox" checked={view.preciseTimeIndicator} onChange={(e) => setPlaylistView({ preciseTimeIndicator: e.target.checked })} /> 정밀 시간 표시</label>
          <label><input type="checkbox" checked={view.showControlsOnAudioTracks} onChange={(e) => setPlaylistView({ showControlsOnAudioTracks: e.target.checked })} /> 트랙 컨트롤</label>
          <label><input type="checkbox" checked={view.showLevelsOnAudioTracks} onChange={(e) => setPlaylistView({ showLevelsOnAudioTracks: e.target.checked })} /> 오디오 레벨</label>
          <label><input type="checkbox" checked={view.showLevelsOnInstrumentTracks} onChange={(e) => setPlaylistView({ showLevelsOnInstrumentTracks: e.target.checked })} /> 악기 레벨</label>
          <label><input type="checkbox" checked={view.miniPreviewEnabled} onChange={(e) => setPlaylistView({ miniPreviewEnabled: e.target.checked })} /> 미니 프리뷰</label>
          <label><input type="checkbox" checked={view.miniPreviewDoubleHeight} onChange={(e) => setPlaylistView({ miniPreviewDoubleHeight: e.target.checked })} /> 미니 프리뷰 2배</label>
          <label><input type="checkbox" checked={view.miniPreviewShowTimeMarkers} onChange={(e) => setPlaylistView({ miniPreviewShowTimeMarkers: e.target.checked })} /> 미니 마커 표시</label>
        </div>
      )}
    </span>
  );
};
