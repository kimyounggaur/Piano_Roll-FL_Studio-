import type { Note } from '../../types/music';

export const OPEN_TOOL_DIALOG_EVENT = 'rolllab:open-tool-dialog';

export type ToolDialogKind =
  | 'articulate'
  | 'quantize'
  | 'chopper'
  | 'arpeggiate'
  | 'strum'
  | 'flam'
  | 'claw'
  | 'limit'
  | 'randomize'
  | 'scaleLevels'
  | 'lfo'
  | 'riff'
  | 'chordProgression';

export type ToolMenuAction =
  | 'quickLegato'
  | 'quickQuantize'
  | 'quickChop'
  | 'glue'
  | 'flipPitch'
  | 'flipTime'
  | 'openDialog';

export interface ToolMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  requiresSelection: boolean;
  action: ToolMenuAction;
  dialog?: ToolDialogKind;
}

export const TOOL_MENU_ITEMS: ToolMenuItem[] = [
  { id: 'quick-legato', label: 'Quick legato', shortcut: 'Ctrl+L', requiresSelection: true, action: 'quickLegato' },
  { id: 'articulate', label: 'Articulate...', requiresSelection: true, action: 'openDialog', dialog: 'articulate' },
  { id: 'quick-quantize', label: 'Quick quantize', shortcut: 'Q', requiresSelection: true, action: 'quickQuantize' },
  { id: 'quantize', label: 'Quantize...', shortcut: 'Alt+Q', requiresSelection: true, action: 'openDialog', dialog: 'quantize' },
  { id: 'quick-chop', label: 'Quick chop', shortcut: 'Ctrl+U', requiresSelection: true, action: 'quickChop' },
  { id: 'chopper', label: 'Chopper...', requiresSelection: true, action: 'openDialog', dialog: 'chopper' },
  { id: 'glue', label: 'Glue', shortcut: 'Ctrl+G', requiresSelection: true, action: 'glue' },
  { id: 'arpeggiate', label: 'Arpeggiate...', shortcut: 'Alt+A', requiresSelection: true, action: 'openDialog', dialog: 'arpeggiate' },
  { id: 'strum', label: 'Strum...', shortcut: 'Alt+S', requiresSelection: true, action: 'openDialog', dialog: 'strum' },
  { id: 'flam', label: 'Flam...', requiresSelection: true, action: 'openDialog', dialog: 'flam' },
  { id: 'claw', label: 'Claw machine...', requiresSelection: true, action: 'openDialog', dialog: 'claw' },
  { id: 'limit', label: 'Limit...', requiresSelection: true, action: 'openDialog', dialog: 'limit' },
  { id: 'flip-pitch', label: 'Flip pitch', requiresSelection: true, action: 'flipPitch' },
  { id: 'flip-time', label: 'Flip time', requiresSelection: true, action: 'flipTime' },
  { id: 'randomize', label: 'Randomize...', shortcut: 'Alt+R', requiresSelection: true, action: 'openDialog', dialog: 'randomize' },
  { id: 'scale-levels', label: 'Scale levels...', requiresSelection: true, action: 'openDialog', dialog: 'scaleLevels' },
  { id: 'lfo', label: 'LFO...', shortcut: 'Alt+O', requiresSelection: true, action: 'openDialog', dialog: 'lfo' },
  { id: 'riff-machine', label: 'Riff machine...', requiresSelection: false, action: 'openDialog', dialog: 'riff' },
  { id: 'chord-progression', label: 'Chord progression...', requiresSelection: false, action: 'openDialog', dialog: 'chordProgression' },
];

export function dispatchOpenToolDialog(kind: ToolDialogKind): void {
  window.dispatchEvent(new CustomEvent<ToolDialogKind>(OPEN_TOOL_DIALOG_EVENT, { detail: kind }));
}

export function isToolMenuItemDisabled(item: ToolMenuItem, selectedCount: number, hasActiveTrack: boolean): boolean {
  if (!hasActiveTrack) return true;
  return item.requiresSelection && selectedCount === 0;
}

export function quickChopNotes(notes: Note[], gridTicks: number, createId: () => string): Note[] {
  const sliceTicks = Math.max(1, Math.round(gridTicks));
  return notes.flatMap((note) => {
    if (!note.selected || note.durationTicks <= sliceTicks) return [note];

    const pieces: Note[] = [];
    let remaining = note.durationTicks;
    let offset = 0;
    while (remaining > 0) {
      const durationTicks = Math.min(sliceTicks, remaining);
      pieces.push({
        ...note,
        id: offset === 0 ? note.id : createId(),
        startTick: note.startTick + offset,
        durationTicks,
        selected: true,
      });
      offset += durationTicks;
      remaining -= durationTicks;
    }
    return pieces;
  });
}
