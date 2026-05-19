import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { ticksPerBar } from '../../utils/time';

export const ArrangementEditMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const playheadTick = useProjectStore((s) => s.playheadTick);
  const loopStartTick = useProjectStore((s) => s.project.settings.loopStartTick);
  const loopEndTick = useProjectStore((s) => s.project.settings.loopEndTick);
  const ppq = useProjectStore((s) => s.project.settings.ppq);
  const timeSignature = useProjectStore((s) => s.project.settings.timeSignature);
  const copySelectedClips = useProjectStore((s) => s.copySelectedClips);
  const cutSelectedClips = useProjectStore((s) => s.cutSelectedClips);
  const pasteClips = useProjectStore((s) => s.pasteClips);
  const duplicateSelectedClips = useProjectStore((s) => s.duplicateSelectedClips);
  const deleteSelectedClips = useProjectStore((s) => s.deleteSelectedClips);
  const toggleSelectedClipsMute = useProjectStore((s) => s.toggleSelectedClipsMute);
  const quantizeSelectedClipStartTimes = useProjectStore((s) => s.quantizeSelectedClipStartTimes);
  const mergePatternClips = useProjectStore((s) => s.mergePatternClips);
  const mergeSimilarPatternClips = useProjectStore((s) => s.mergeSimilarPatternClips);
  const insertSpace = useProjectStore((s) => s.insertSpace);
  const sliceAndInsertSpace = useProjectStore((s) => s.sliceAndInsertSpace);
  const deleteSpace = useProjectStore((s) => s.deleteSpace);
  const pitchSelectedAudioClips = useProjectStore((s) => s.pitchSelectedAudioClips);
  const reverseSelectedAudioClips = useProjectStore((s) => s.reverseSelectedAudioClips);
  const autoFadesEnabled = useProjectStore((s) => s.autoFadesEnabled);
  const manualFadesEnabled = useProjectStore((s) => s.manualFadesEnabled);
  const snapFadeHandles = useProjectStore((s) => s.snapFadeHandles);
  const setAutoFades = useProjectStore((s) => s.setAutoFades);
  const setManualFades = useProjectStore((s) => s.setManualFades);
  const setSnapFadeHandles = useProjectStore((s) => s.setSnapFadeHandles);
  const cloneSelectedPlaylistTrack = useProjectStore((s) => s.cloneSelectedPlaylistTrack);

  const barTicks = ticksPerBar(ppq, timeSignature);
  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <span className="arrangement-dropdown">
      <button className={open ? 'active' : ''} onClick={() => setOpen((v) => !v)}>Edit</button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline">
          <button onClick={() => run(cutSelectedClips)}>잘라내기 Ctrl+X</button>
          <button onClick={() => run(copySelectedClips)}>복사 Ctrl+C</button>
          <button onClick={() => run(() => pasteClips(playheadTick))}>붙여넣기 Ctrl+V</button>
          <button onClick={() => run(duplicateSelectedClips)}>복제 Ctrl+D</button>
          <button onClick={() => run(deleteSelectedClips)}>삭제 Del</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(toggleSelectedClipsMute)}>음소거 / 해제 Alt+M</button>
          <button onClick={() => run(quantizeSelectedClipStartTimes)}>퀵 퀀타이즈 Ctrl+Q</button>
          <button onClick={() => run(mergePatternClips)}>패턴 클립 병합 Ctrl+G</button>
          <button onClick={() => run(mergeSimilarPatternClips)}>유사 패턴 병합 Ctrl+Shift+G</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(() => pitchSelectedAudioClips(1))}>오디오 피치 +1</button>
          <button onClick={() => run(() => pitchSelectedAudioClips(-1))}>오디오 피치 -1</button>
          <button onClick={() => run(reverseSelectedAudioClips)}>오디오 리버스</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(() => insertSpace(playheadTick, barTicks))}>공백 삽입 Ctrl+Ins</button>
          <button onClick={() => run(() => sliceAndInsertSpace(playheadTick, barTicks))}>슬라이스 후 공백 삽입</button>
          <button onClick={() => run(() => deleteSpace(loopStartTick, loopEndTick || loopStartTick + barTicks))}>루프 구간 공백 삭제</button>
          <button onClick={() => run(cloneSelectedPlaylistTrack)}>선택 트랙 복제</button>
          <div className="arrangement-menu__separator" />
          <label><input type="checkbox" checked={autoFadesEnabled} onChange={(e) => setAutoFades(e.target.checked)} /> Auto fades</label>
          <label><input type="checkbox" checked={manualFadesEnabled} onChange={(e) => setManualFades(e.target.checked)} /> Manual fades</label>
          <label><input type="checkbox" checked={snapFadeHandles} onChange={(e) => setSnapFadeHandles(e.target.checked)} /> Snap fade handles</label>
        </div>
      )}
    </span>
  );
};
