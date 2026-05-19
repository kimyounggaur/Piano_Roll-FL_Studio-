import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { Note } from '../../types/music';
import { PROGRESSION_PRESETS } from '../../utils/chordProgression';
import { snapUnitToTicks } from '../../utils/time';
import { ToolDialog, type ToolDialogApplyValues } from './ToolDialog';
import {
  isToolMenuItemDisabled,
  OPEN_TOOL_DIALOG_EVENT,
  quickChopNotes,
  TOOL_MENU_ITEMS,
  type ToolDialogKind,
  type ToolMenuItem,
} from './toolsMenuModel';

function createNoteId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampVelocity(value: number): number {
  return Math.max(1, Math.min(127, Math.round(value)));
}

function clampPitch(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

export function PianoRollToolsMenu() {
  const [open, setOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<ToolDialogKind | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const {
    project,
    playheadTick,
    activeTrack,
    setNotes,
    snapTicks,
    quantizeSelectedNotes,
    glueSelectedNotes,
    legatoSelectedNotes,
    flipSelectedNotes,
    limitSelectedNotes,
    randomizeSelectedNotes,
    applyLfoToSelectedNotes,
    articulateSelectedNotes,
    generateChordProgression,
    generateRiff,
    strumSelectedNotes,
    arpeggiateSelectedNotes,
    scaleVelocitySelectedNotes,
  } = useProjectStore();

  const active = project.tracks.find((track) => track.id === project.activeTrackId) ?? null;
  const selectedCount = active?.notes.filter((note) => note.selected).length ?? 0;
  const snap = snapTicks();
  const hasActiveTrack = active !== null;

  const menuItems = useMemo(
    () => TOOL_MENU_ITEMS.map((item) => ({
      ...item,
      disabled: isToolMenuItemDisabled(item, selectedCount, hasActiveTrack),
    })),
    [hasActiveTrack, selectedCount],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToolDialogKind>).detail;
      setDialogKind(detail);
      setOpen(false);
    };
    window.addEventListener(OPEN_TOOL_DIALOG_EVENT, handler);
    return () => window.removeEventListener(OPEN_TOOL_DIALOG_EVENT, handler);
  }, []);

  const quickChopSelected = (gridTicks: number) => {
    const track = activeTrack();
    if (!track) return;
    setNotes(track.id, quickChopNotes(track.notes, gridTicks, createNoteId));
  };

  const applyFlam = (offsetTicks: number, velocityDrop: number) => {
    const track = activeTrack();
    if (!track) return;
    const graceNotes = track.notes
      .filter((note) => note.selected)
      .map<Note>((note) => ({
        ...note,
        id: createNoteId(),
        startTick: Math.max(0, note.startTick - offsetTicks),
        durationTicks: Math.max(1, Math.min(note.durationTicks, Math.round(offsetTicks * 0.75))),
        velocity: clampVelocity(note.velocity - velocityDrop),
        selected: true,
      }));
    if (graceNotes.length === 0) return;
    setNotes(track.id, [...track.notes.map((note) => ({ ...note, selected: false })), ...graceNotes]);
  };

  const applyClaw = (durationScale: number, velocityAccent: number) => {
    const track = activeTrack();
    if (!track) return;
    let selectedIndex = 0;
    setNotes(track.id, track.notes.map((note) => {
      if (!note.selected) return note;
      const accent = selectedIndex % 2 === 0 ? velocityAccent : -velocityAccent;
      selectedIndex += 1;
      return {
        ...note,
        durationTicks: Math.max(1, Math.round(note.durationTicks * durationScale)),
        velocity: clampVelocity(note.velocity + accent),
      };
    }));
  };

  const handleMenuItem = (item: ToolMenuItem) => {
    if (isToolMenuItemDisabled(item, selectedCount, hasActiveTrack)) return;
    setOpen(false);
    switch (item.action) {
      case 'quickLegato':
        legatoSelectedNotes(0);
        break;
      case 'quickQuantize':
        quantizeSelectedNotes(snap, project.settings.quantizeStrength, project.settings.quantizeDuration);
        break;
      case 'quickChop':
        quickChopSelected(snap);
        break;
      case 'glue':
        glueSelectedNotes();
        break;
      case 'flipPitch':
        flipSelectedNotes('pitch');
        break;
      case 'flipTime':
        flipSelectedNotes('time');
        break;
      case 'openDialog':
        setDialogKind(item.dialog ?? null);
        break;
    }
  };

  const handleApplyDialog = (values: ToolDialogApplyValues) => {
    const { settings } = project;
    const startTick = Math.max(0, Math.round(playheadTick / snap) * snap);
    switch (values.kind) {
      case 'articulate':
        articulateSelectedNotes(values.pattern, values.intensity);
        break;
      case 'quantize':
        quantizeSelectedNotes(values.gridTicks, values.strength, values.quantizeDuration);
        break;
      case 'chopper':
        quickChopSelected(values.gridTicks);
        break;
      case 'arpeggiate':
        arpeggiateSelectedNotes(values.pattern, values.stepTicks, values.repeatCount, values.replaceOriginals);
        break;
      case 'strum':
        strumSelectedNotes(values.amountTicks, values.direction);
        break;
      case 'flam':
        applyFlam(values.offsetTicks, values.velocityDrop);
        break;
      case 'claw':
        applyClaw(values.durationScale, values.velocityAccent);
        break;
      case 'limit':
        limitSelectedNotes(clampPitch(values.minPitch), clampPitch(values.maxPitch), values.mode);
        break;
      case 'randomize':
        randomizeSelectedNotes({
          pitchRangeSemitones: values.pitchRangeSemitones,
          timeRangeTicks: values.timeRangeTicks,
          velocityRange: values.velocityRange,
          durationRangeTicks: values.durationRangeTicks,
          seed: values.seed,
        });
        break;
      case 'scaleLevels':
        scaleVelocitySelectedNotes(values.amount);
        break;
      case 'lfo':
        applyLfoToSelectedNotes({
          target: values.target,
          waveform: values.waveform,
          periodTicks: values.periodTicks,
          depth: values.depth,
          phase: values.phase,
        });
        break;
      case 'riff':
        generateRiff({
          bars: values.bars,
          density: values.density,
          rhythm: values.rhythm,
          contour: values.contour,
          scaleRoot: settings.scaleRoot,
          scaleName: settings.scaleName,
          pitchMin: Math.min(values.pitchMin, values.pitchMax),
          pitchMax: Math.max(values.pitchMin, values.pitchMax),
          velocityRange: values.velocityRange,
          ppq: settings.ppq,
          tsNumerator: settings.timeSignature.numerator,
          startTick,
          seed: values.seed,
        });
        break;
      case 'chordProgression':
        generateChordProgression({
          rootKey: settings.scaleRoot,
          scaleName: settings.scaleName === 'none' ? 'major' : settings.scaleName,
          template: PROGRESSION_PRESETS[values.templateKey],
          bars: values.bars,
          chordsPerBar: values.chordsPerBar,
          ppq: settings.ppq,
          tsNumerator: settings.timeSignature.numerator,
          startTick,
          with7th: values.with7th,
          voicing: 'smooth',
        });
        break;
    }
    setDialogKind(null);
  };

  return (
    <div className="piano-roll-tools-menu" ref={rootRef}>
      <button
        className={`tool-btn tools-menu-trigger${open ? ' active' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="FL Studio style tools menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="tool-label">Tools</span>
      </button>

      {open && (
        <div className="tools-menu-popover" role="menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className="tools-menu-item"
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => handleMenuItem(item)}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}

      {dialogKind && (
        <ToolDialog
          key={dialogKind}
          kind={dialogKind}
          open
          selectedCount={selectedCount}
          snapTicks={snapUnitToTicks(project.settings.snapUnit, project.settings.ppq)}
          ppq={project.settings.ppq}
          scaleName={project.settings.scaleName}
          onApply={handleApplyDialog}
          onClose={() => setDialogKind(null)}
        />
      )}
    </div>
  );
}
