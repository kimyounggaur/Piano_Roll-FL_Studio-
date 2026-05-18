// ═══════════════════════════════════════════════════════════════════
//  toneEngine — Tone.js-based playback for a RollLab Project
//
//  Pure audio module. Knows nothing about React. The host UI calls
//  initAudio() on the first user gesture (typically the Play button)
//  and then drives the engine via playProject / pauseProject / stopProject.
// ═══════════════════════════════════════════════════════════════════

import * as Tone from 'tone';
import type { Project, Track, Note } from '../types/music';
import { tickToSeconds, ticksPerBar } from '../utils/time';

// ── State ──────────────────────────────────────────────────────────────────
const synths: Map<string, Tone.PolySynth> = new Map();
let metronomeSynth: Tone.MetalSynth | null = null;
let previewSynth: Tone.PolySynth | null = null;
let scheduledEventIds: number[] = [];
let audioReady = false;

// ─────────────────────────────────────────────────────────────────────────
//  Lifecycle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Must be called from inside a user-gesture handler (click, keydown) to
 * satisfy browser autoplay policy. Idempotent — safe to call repeatedly.
 */
export async function initAudio(): Promise<void> {
  if (audioReady) return;
  await Tone.start();
  audioReady = true;
}

/** Dispose every synth this engine has allocated. */
export function disposeAudio(): void {
  stopProject();
  synths.forEach((s) => s.dispose());
  synths.clear();
  glideSynths.forEach((s) => s.dispose());
  glideSynths.clear();
  metronomeSynth?.dispose();
  metronomeSynth = null;
  previewSynth?.dispose();
  previewSynth = null;
  audioReady = false;
}

// ─────────────────────────────────────────────────────────────────────────
//  Synth pool (one PolySynth per track + one MonoSynth for glides)
// ─────────────────────────────────────────────────────────────────────────

function getSynth(track: Track): Tone.PolySynth {
  let s = synths.get(track.id);
  if (!s) {
    s = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope:   { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.5 },
    }).toDestination();
    synths.set(track.id, s);
  }
  // Apply per-track gain / pan each schedule (cheap)
  s.volume.value = linearToDb(track.volume);
  return s;
}

// Dedicated glide voice per track — frequency.exponentialRampTo works on
// MonoSynth in a way PolySynth doesn't expose. We allocate lazily.
const glideSynths: Map<string, Tone.MonoSynth> = new Map();
function getGlideSynth(track: Track): Tone.MonoSynth {
  let s = glideSynths.get(track.id);
  if (!s) {
    s = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope:   { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.4 },
    }).toDestination();
    glideSynths.set(track.id, s);
  }
  s.volume.value = linearToDb(track.volume);
  return s;
}

function linearToDb(v: number): number {
  if (v <= 0) return -Infinity;
  return 20 * Math.log10(v);
}

function getOrCreateMetronome(): Tone.MetalSynth {
  if (!metronomeSynth) {
    metronomeSynth = new Tone.MetalSynth({
      envelope:        { attack: 0.001, decay: 0.1, release: 0.01 },
      resonance:       4000,
      modulationIndex: 32,
      octaves:         1.5,
    }).toDestination();
    metronomeSynth.volume.value = -12;
  }
  return metronomeSynth;
}

function getOrCreatePreviewSynth(): Tone.PolySynth {
  if (!previewSynth) {
    previewSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope:   { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.4 },
    }).toDestination();
  }
  return previewSynth;
}

// ─────────────────────────────────────────────────────────────────────────
//  Track filtering — solo / mute precedence
// ─────────────────────────────────────────────────────────────────────────

function playableTracks(tracks: Track[]): Track[] {
  const soloActive = tracks.some((t) => t.solo);
  return tracks.filter((t) => !t.muted && (!soloActive || t.solo));
}

// ─────────────────────────────────────────────────────────────────────────
//  Scheduling
// ─────────────────────────────────────────────────────────────────────────

/** Wipe every event we've scheduled and reset the event-id list. */
function clearScheduled(): void {
  // Transport.cancel(0) removes every scheduled event past time 0. We pair
  // it with our local id list so callers that introspect can see "nothing
  // pending" too.
  Tone.getTransport().cancel(0);
  scheduledEventIds = [];
}

/**
 * Schedule every audible note in the project on the Transport timeline.
 * Coordinates are in absolute transport seconds — looping is handled by
 * Tone.Transport.loopStart / loopEnd, not by manual re-scheduling.
 */
export function scheduleNotes(
  project: Project,
  opts: { onTick?: (tick: number) => void; fromSec?: number } = {},
): void {
  const { bpm, ppq } = project.settings;
  const fromSec = opts.fromSec ?? 0;
  for (const track of playableTracks(project.tracks)) {
    const synth = getSynth(track);
    // Pre-index slide notes by startTick so the target lookup is O(1).
    const slidesByEnd = new Map<number, Note>();
    for (const n of track.notes) {
      if (n.noteKind === 'slide') {
        slidesByEnd.set(n.startTick + n.durationTicks, n);
      }
    }
    for (const note of track.notes) {
      if (note.muted) continue;
      if (note.noteKind === 'slide') {
        scheduleSlideNote(track, note, project, fromSec);
        continue;
      }
      const t0  = tickToSeconds(note.startTick, bpm, ppq);
      if (t0 < fromSec) continue;
      const dur = Math.max(0.02, tickToSeconds(note.durationTicks, bpm, ppq));
      const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
      const vel  = clamp01(note.velocity / 127);

      // Portamento — temporarily set the synth's voice portamento so the
      // glide into THIS note's pitch is audible. Reset afterwards so
      // following notes don't inherit it.
      const portamento = note.noteKind === 'portamento'
        ? Math.min(0.15, dur * 0.3)
        : 0;
      // Slide consumes this note as its target; skip re-triggering on poly.
      const consumed = slidesByEnd.has(note.startTick);

      if (consumed) continue;
      const id = Tone.getTransport().schedule((time) => {
        if (portamento > 0) {
          // PolySynth.set forwards to every voice — apply briefly.
          synth.set({ portamento });
          synth.triggerAttackRelease(freq, dur, time, vel);
          // Reset after the attack envelope so future voices don't glide.
          setTimeout(() => synth.set({ portamento: 0 }), 50);
        } else {
          synth.triggerAttackRelease(freq, dur, time, vel);
        }
      }, t0);
      scheduledEventIds.push(id);
    }
  }

  // Playhead update — fires on every 32nd-note tick of the Transport.
  if (opts.onTick) {
    const onTickCb = opts.onTick;
    const tickId = Tone.getTransport().scheduleRepeat((time) => {
      const seconds = Tone.getTransport().seconds;
      const tick = Math.max(0, Math.floor((seconds / (60 / bpm)) * ppq));
      Tone.getDraw().schedule(() => onTickCb(tick), time);
    }, '32n');
    scheduledEventIds.push(tickId);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Slide note — find the next normal note that the slide ends on,
//  trigger attack at slide.start with slide.pitch, ramp to target pitch
//  over the slide window, release after target.duration.
//  If no target overlaps, the slide note plays as a regular monotone.
// ─────────────────────────────────────────────────────────────────────
function scheduleSlideNote(track: Track, slide: Note, project: Project, fromSec: number): void {
  const { bpm, ppq } = project.settings;
  const t0 = tickToSeconds(slide.startTick, bpm, ppq);
  if (t0 < fromSec) return;
  const slideDur = Math.max(0.01, tickToSeconds(slide.durationTicks, bpm, ppq));
  // Target = note that begins exactly at slide.endTick (with small tolerance).
  const slideEnd = slide.startTick + slide.durationTicks;
  const target = track.notes.find((n) =>
    n.id !== slide.id &&
    n.noteKind !== 'slide' &&
    Math.abs(n.startTick - slideEnd) <= Math.max(1, ppq / 32),
  );
  const startFreq = Tone.Frequency(slide.pitch, 'midi').toFrequency();
  const endFreq   = Tone.Frequency(target?.pitch ?? slide.pitch, 'midi').toFrequency();
  const tailDur   = target ? Math.max(0.02, tickToSeconds(target.durationTicks, bpm, ppq)) : 0;
  const vel       = clamp01(slide.velocity / 127);
  const glide     = getGlideSynth(track);
  const id = Tone.getTransport().schedule((time) => {
    glide.frequency.setValueAtTime(startFreq, time);
    glide.triggerAttack(startFreq, time, vel);
    glide.frequency.exponentialRampTo(endFreq, slideDur, time);
    glide.triggerRelease(time + slideDur + tailDur);
  }, t0);
  scheduledEventIds.push(id);
}

function scheduleMetronome(totalSeconds: number, bpm: number, tsNumerator: number): void {
  const metro = getOrCreateMetronome();
  const beatSeconds = 60 / bpm;
  const beats = Math.ceil(totalSeconds / beatSeconds);
  for (let b = 0; b < beats; b++) {
    const t = b * beatSeconds;
    const accent = b % tsNumerator === 0;
    const id = Tone.getTransport().schedule((time) => {
      metro.triggerAttackRelease('16n', time, accent ? 0.9 : 0.4);
    }, t);
    scheduledEventIds.push(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Transport control
// ─────────────────────────────────────────────────────────────────────────

export interface PlayOptions {
  /** Where to start playback (in ticks). Default 0. */
  startTick?: number;
  /** Total tick length of the arrangement (used for non-loop end + metronome). */
  totalTicks?: number;
  /** Loop the transport. Uses project.settings.loopStart/EndTick if set. */
  loop?: boolean;
  /** Click track on/off. */
  metronome?: boolean;
  /** Fires roughly every 32nd note with the current playhead tick. */
  onTick?: (tick: number) => void;
  /** Fires when non-looping playback reaches the end. */
  onStop?: () => void;
}

/**
 * Play the project from the given tick (or 0). All scheduled events from a
 * previous call are cleared first. Caller must have invoked initAudio()
 * once in response to a user gesture.
 */
export async function playProject(project: Project, opts: PlayOptions = {}): Promise<void> {
  await initAudio();

  const { bpm, ppq, timeSignature, loopStartTick, loopEndTick } = project.settings;
  const startTick  = opts.startTick  ?? 0;
  const totalTicks = opts.totalTicks ?? barsToTotalTicks(project);

  stopProject();

  Tone.getTransport().bpm.value = bpm;
  Tone.getTransport().PPQ = ppq;

  // Schedule all notes (+ tick callback)
  scheduleNotes(project, { onTick: opts.onTick });

  // Metronome
  if (opts.metronome) {
    const totalSec = tickToSeconds(totalTicks, bpm, ppq);
    scheduleMetronome(totalSec, bpm, timeSignature.numerator);
  }

  // Loop
  if (opts.loop) {
    const looped = loopEndTick > loopStartTick;
    const ls = looped ? loopStartTick : 0;
    const le = looped ? loopEndTick   : totalTicks;
    Tone.getTransport().loop      = true;
    Tone.getTransport().loopStart = tickToSeconds(ls, bpm, ppq);
    Tone.getTransport().loopEnd   = tickToSeconds(le, bpm, ppq);
  } else {
    Tone.getTransport().loop = false;
    // End-of-arrangement stop callback
    if (opts.onStop) {
      const endSec = tickToSeconds(totalTicks, bpm, ppq);
      const stopCb = opts.onStop;
      const id = Tone.getTransport().schedule((time) => {
        Tone.getDraw().schedule(() => {
          stopProject();
          stopCb();
        }, time);
      }, Math.max(0, endSec - 0.001));
      scheduledEventIds.push(id);
    }
  }

  // Seek to startTick (in seconds) and go
  Tone.getTransport().seconds = tickToSeconds(startTick, bpm, ppq);

  Tone.getTransport().start();
}

/** Stop playback and clear all scheduled events. */
export function stopProject(): void {
  Tone.getTransport().stop();
  clearScheduled();
  Tone.getTransport().loop = false;
}

/** Pause playback without clearing scheduled events. resume with resumeProject(). */
export function pauseProject(): void {
  Tone.getTransport().pause();
}

/** Resume playback from the paused position. */
export function resumeProject(): void {
  Tone.getTransport().start();
}

/** Live BPM change. Affects already-scheduled events because Tone uses musical time. */
export function setBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

/**
 * Performance-mode re-scheduling — cancels every event in the future and
 * re-schedules notes from `tick` onward. Loop / metronome / tick-callback
 * are NOT re-installed — caller is responsible for re-arming those if
 * they want to keep firing.
 */
export function rescheduleFromTick(project: Project, tick: number): void {
  const { bpm, ppq } = project.settings;
  const fromSec = tickToSeconds(tick, bpm, ppq);
  // Drop events that haven't fired yet; keep transport running.
  Tone.getTransport().cancel(fromSec);
  scheduledEventIds = scheduledEventIds.filter(() => false);
  scheduleNotes(project, { fromSec });
}

// Legacy alias (some older code calls this).
export const setTransportBPM = setBpm;

// ─────────────────────────────────────────────────────────────────────────
//  Preview — single-note audition
// ─────────────────────────────────────────────────────────────────────────

/**
 * Play a single note immediately on the shared preview synth.
 * Used by piano-keyboard clicks, note-creation feedback, etc.
 * @param pitch       MIDI pitch 0–127
 * @param velocity    1–127 (default 100)
 * @param durationMs  release length in ms (default 250)
 */
export function previewNote(pitch: number, velocity = 100, durationMs = 250): void {
  if (!audioReady) {
    // First gesture hasn't happened yet — silently no-op rather than throw.
    return;
  }
  const synth = getOrCreatePreviewSynth();
  const freq  = Tone.Frequency(pitch, 'midi').toFrequency();
  const vel   = clamp01(velocity / 127);
  synth.triggerAttackRelease(freq, durationMs / 1000, undefined, vel);
}

// ─────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function barsToTotalTicks(project: Project): number {
  return ticksPerBar(project.settings.ppq, project.settings.timeSignature)
       * project.settings.bars;
}

// ─────────────────────────────────────────────────────────────────────────
//  Back-compat shims — keep older call sites working until they migrate.
// ─────────────────────────────────────────────────────────────────────────

/** @deprecated use playProject + scheduleNotes */
export async function startPlayback(
  tracks: Track[],
  bpm: number,
  ppq: number,
  startTick: number,
  totalTicks: number,
  onTick: (tick: number) => void,
  onStop: () => void,
  loop: boolean,
  metronome: boolean,
  tsNumerator: number,
): Promise<void> {
  // Build a minimal Project shape the new API expects
  const fakeProject: Project = {
    name: '',
    settings: {
      bpm, ppq,
      timeSignature: { numerator: tsNumerator, denominator: 4 },
      bars: Math.ceil(totalTicks / ticksPerBar(ppq, { numerator: tsNumerator, denominator: 4 })),
      loopStartTick: 0,
      loopEndTick:   0,
      snapUnit:      '1/16',
      scaleRoot:     0,
      scaleName:     'none',
      scaleSnapEnabled: false,
      stampChordType: 'major',
      stampHoldTool: false,
      stampDurationTicks: 0,
      quantizeStrength: 1,
      quantizeDuration: false,
      humanizeTimingTicks: 20,
      humanizeVelocity: 10,
      strumAmountTicks: 60,
      strumDirection: 'down',
      arpPattern: 'up',
      arpStepTicks: 120,
      arpRepeatCount: 2,
      arpReplaceOriginals: true,
      randomVelMin: 80,
      randomVelMax: 110,
      scaleVelocityAmount: 1.1,
      ghostNotesVisible: true,
      ghostDoubleClickActivates: true,
    },
    tracks,
    activeTrackId: tracks[0]?.id ?? null,
  };
  await playProject(fakeProject, { startTick, totalTicks, loop, metronome, onTick, onStop });
}

/** @deprecated use stopProject */
export const stopPlayback = stopProject;

// Note import is used by typing inside scheduleNotes
export type { Note };
