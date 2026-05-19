import React, { useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { ticksPerBar } from '../../utils/time';

interface ArrangementContextMenuProps {
  x: number;
  y: number;
  atTick: number;
  clipId: string | null;
  onClose: () => void;
}

export const ArrangementContextMenu: React.FC<ArrangementContextMenuProps> = ({ x, y, atTick, clipId, onClose }) => {
  const copySelectedClips = useProjectStore((s) => s.copySelectedClips);
  const cutSelectedClips = useProjectStore((s) => s.cutSelectedClips);
  const pasteClips = useProjectStore((s) => s.pasteClips);
  const duplicateSelectedClips = useProjectStore((s) => s.duplicateSelectedClips);
  const deleteSelectedClips = useProjectStore((s) => s.deleteSelectedClips);
  const shiftSelectedClips = useProjectStore((s) => s.shiftSelectedClips);
  const toggleSelectedClipsMute = useProjectStore((s) => s.toggleSelectedClipsMute);
  const pitchSelectedAudioClips = useProjectStore((s) => s.pitchSelectedAudioClips);
  const reverseSelectedAudioClips = useProjectStore((s) => s.reverseSelectedAudioClips);
  const quantizeSelectedClipStartTimes = useProjectStore((s) => s.quantizeSelectedClipStartTimes);
  const mergePatternClips = useProjectStore((s) => s.mergePatternClips);
  const insertSpace = useProjectStore((s) => s.insertSpace);
  const deleteSpace = useProjectStore((s) => s.deleteSpace);
  const ppq = useProjectStore((s) => s.project.settings.ppq);
  const timeSignature = useProjectStore((s) => s.project.settings.timeSignature);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };
  const spaceTicks = ticksPerBar(ppq, timeSignature);

  return (
    <div className="arrangement-menu arrangement-context-menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      {clipId ? (
        <>
          <button onClick={() => run(cutSelectedClips)}>잘라내기 Ctrl+X</button>
          <button onClick={() => run(copySelectedClips)}>복사 Ctrl+C</button>
          <button onClick={() => run(() => pasteClips(atTick))}>붙여넣기 Ctrl+V</button>
          <button onClick={() => run(duplicateSelectedClips)}>복제 Ctrl+D</button>
          <button onClick={() => run(deleteSelectedClips)}>삭제 Del</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(() => shiftSelectedClips('left'))}>왼쪽으로 이동</button>
          <button onClick={() => run(() => shiftSelectedClips('right'))}>오른쪽으로 이동</button>
          <button onClick={() => run(() => shiftSelectedClips('up'))}>위 트랙으로 이동</button>
          <button onClick={() => run(() => shiftSelectedClips('down'))}>아래 트랙으로 이동</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(toggleSelectedClipsMute)}>음소거 / 해제 Alt+M</button>
          <button onClick={() => run(() => pitchSelectedAudioClips(1))}>피치 +1 반음</button>
          <button onClick={() => run(() => pitchSelectedAudioClips(-1))}>피치 -1 반음</button>
          <button onClick={() => run(reverseSelectedAudioClips)}>오디오 리버스</button>
          <div className="arrangement-menu__separator" />
          <button onClick={() => run(quantizeSelectedClipStartTimes)}>퀵 퀀타이즈 Ctrl+Q</button>
          <button onClick={() => run(mergePatternClips)}>패턴 클립 병합 Ctrl+G</button>
        </>
      ) : (
        <>
          <button onClick={() => run(() => pasteClips(atTick))}>붙여넣기</button>
          <button onClick={() => run(() => insertSpace(atTick, spaceTicks))}>공백 삽입 Ctrl+Ins</button>
          <button onClick={() => run(() => deleteSpace(atTick, atTick + spaceTicks))}>공백 삭제 Ctrl+Del</button>
        </>
      )}
    </div>
  );
};
