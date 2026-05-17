import * as Tone from 'tone';
import type { Track } from '../types/music';
import { tickToSeconds } from '../utils/time';

let synths: Map<string, Tone.PolySynth> = new Map();
let metronomeSynth: Tone.MetalSynth | null = null;
let scheduledEvents: number[] = [];

export function getOrCreateSynth(trackId: string): Tone.PolySynth {
  if (!synths.has(trackId)) {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.5 },
    }).toDestination();
    synths.set(trackId, synth);
  }
  return synths.get(trackId)!;
}

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
  tsNumerator: number
): Promise<void> {
  await Tone.start();
  stopPlayback();

  Tone.getTransport().bpm.value = bpm;
  Tone.getTransport().stop();
  Tone.getTransport().cancel();

  const totalSeconds = tickToSeconds(totalTicks, bpm, ppq);

  // Schedule notes
  for (const track of tracks) {
    if (track.muted) continue;
    const synth = getOrCreateSynth(track.id);
    for (const note of track.notes) {
      if (note.startTick < startTick) continue;
      const noteStart = tickToSeconds(note.startTick - startTick, bpm, ppq);
      const noteDur = Math.max(0.05, tickToSeconds(note.durationTicks, bpm, ppq));
      const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
      const vel = note.velocity / 127;
      const id = Tone.getTransport().schedule((time) => {
        synth.triggerAttackRelease(freq, noteDur, time, vel);
      }, noteStart);
      scheduledEvents.push(id);
    }
  }

  // Metronome
  if (metronome) {
    metronomeSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      resonance: 4000, modulationIndex: 32, octaves: 1.5,
    }).toDestination();
    metronomeSynth.volume.value = -12;
    const beatSeconds = 60 / bpm;
    const beats = Math.ceil(totalSeconds / beatSeconds);
    for (let b = 0; b < beats; b++) {
      const t = b * beatSeconds;
      const id = Tone.getTransport().schedule((time) => {
        metronomeSynth?.triggerAttackRelease('16n', time, b % tsNumerator === 0 ? 0.9 : 0.4);
      }, t);
      scheduledEvents.push(id);
    }
  }

  // Playhead ticker (every ~50ms resolution)
  const tickInterval = Tone.getTransport().scheduleRepeat((time) => {
    const elapsed = Tone.getTransport().seconds;
    const tick = startTick + Math.floor((elapsed / (60 / bpm)) * ppq);
    Tone.getDraw().schedule(() => onTick(tick), time);
  }, '32n');
  scheduledEvents.push(tickInterval);

  // Loop / end
  if (loop) {
    Tone.getTransport().loop = true;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = totalSeconds;
  } else {
    Tone.getTransport().loop = false;
    const stopId = Tone.getTransport().schedule(() => {
      Tone.getDraw().schedule(() => onStop(), Tone.now());
    }, totalSeconds - 0.001);
    scheduledEvents.push(stopId);
  }

  Tone.getTransport().start();
}

export function stopPlayback(): void {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  scheduledEvents = [];
  metronomeSynth?.dispose();
  metronomeSynth = null;
}

export function pausePlayback(): void {
  Tone.getTransport().pause();
}

export function setTransportBPM(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

export function disposeSynths(): void {
  synths.forEach((s) => s.dispose());
  synths = new Map();
}
