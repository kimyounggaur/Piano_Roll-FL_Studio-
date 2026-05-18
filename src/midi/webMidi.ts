// ═══════════════════════════════════════════════════════════════════
//  Web MIDI input — thin wrapper around navigator.requestMIDIAccess.
//
//  The module deliberately stays UI-agnostic: callers subscribe to
//  events and decide what to do (preview, record, etc.).
//
//  Browser support:
//   - Chrome / Edge: full support (HTTPS or localhost).
//   - Firefox: as of recent versions, behind a flag in some channels.
//   - Safari: 16.4+ on macOS / iOS 16.4+; HTTPS required.
//  isWebMidiSupported() reflects only `navigator.requestMIDIAccess`
//  presence — the actual permission prompt happens on requestAccess().
// ═══════════════════════════════════════════════════════════════════

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export type MidiInputEvent =
  | { type: 'noteOn';  pitch: number; velocity: number; channel: number; deviceId: string }
  | { type: 'noteOff'; pitch: number;                   channel: number; deviceId: string }
  | { type: 'sustain'; on: boolean; channel: number; deviceId: string }; // TODO: not consumed yet

type Listener = (e: MidiInputEvent) => void;
type DeviceListener = (devices: MidiDeviceInfo[]) => void;

// ─────────────────────────────────────────────────────────────────────
//  Module state — single global access object per app session.
// ─────────────────────────────────────────────────────────────────────
let access: MIDIAccess | null = null;
let selectedInputId: string | null = null;
const listeners      = new Set<Listener>();
const deviceListeners = new Set<DeviceListener>();
const boundInputs    = new Set<string>();

// ─────────────────────────────────────────────────────────────────────
//  Capability helpers
// ─────────────────────────────────────────────────────────────────────
export function isWebMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

export function isSecureContextOk(): boolean {
  // Web MIDI requires a secure context (HTTPS or localhost).
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

/** True once the user has granted access at least once this session. */
export function isAccessGranted(): boolean {
  return access !== null;
}

// ─────────────────────────────────────────────────────────────────────
//  Permission request
// ─────────────────────────────────────────────────────────────────────
export async function requestAccess(): Promise<MidiDeviceInfo[]> {
  if (!isWebMidiSupported()) {
    throw new Error('이 브라우저는 Web MIDI를 지원하지 않습니다.');
  }
  if (!isSecureContextOk()) {
    throw new Error('Web MIDI는 HTTPS 또는 localhost에서만 동작합니다.');
  }
  access = await navigator.requestMIDIAccess({ sysex: false });
  access.onstatechange = () => {
    rebindInputs();
    emitDeviceList();
  };
  rebindInputs();
  return listInputs();
}

// ─────────────────────────────────────────────────────────────────────
//  Device list
// ─────────────────────────────────────────────────────────────────────
export function listInputs(): MidiDeviceInfo[] {
  if (!access) return [];
  const arr: MidiDeviceInfo[] = [];
  access.inputs.forEach((input) => {
    arr.push({
      id: input.id,
      name: input.name ?? '(이름 없음)',
      manufacturer: input.manufacturer ?? '',
      state: input.state,
    });
  });
  return arr;
}

export function subscribeDeviceList(listener: DeviceListener): () => void {
  deviceListeners.add(listener);
  if (access) listener(listInputs());
  return () => { deviceListeners.delete(listener); };
}

function emitDeviceList(): void {
  const list = listInputs();
  deviceListeners.forEach((l) => l(list));
}

// ─────────────────────────────────────────────────────────────────────
//  Input selection
//  We keep one "active" input id; messages from other inputs are ignored.
//  Pass null to listen to every input (useful when there's only one).
// ─────────────────────────────────────────────────────────────────────
export function setActiveInput(deviceId: string | null): void {
  selectedInputId = deviceId;
}

export function getActiveInputId(): string | null {
  return selectedInputId;
}

// ─────────────────────────────────────────────────────────────────────
//  Event subscription
// ─────────────────────────────────────────────────────────────────────
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ─────────────────────────────────────────────────────────────────────
//  Internal — bind onmidimessage on every input. Re-runs on statechange.
// ─────────────────────────────────────────────────────────────────────
function rebindInputs(): void {
  if (!access) return;
  access.inputs.forEach((input) => {
    if (boundInputs.has(input.id)) return;
    input.onmidimessage = (msg: MIDIMessageEvent) => {
      if (selectedInputId !== null && input.id !== selectedInputId) return;
      handleMessage(input.id, msg.data);
    };
    boundInputs.add(input.id);
  });
}

function handleMessage(deviceId: string, data: Uint8Array | null): void {
  if (!data || data.length < 1) return;
  const status  = data[0] & 0xf0;
  const channel = (data[0] & 0x0f) + 1;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;

  // Note On — velocity 0 is treated as Note Off by the MIDI spec.
  if (status === 0x90) {
    if (d2 === 0) emit({ type: 'noteOff', pitch: d1, channel, deviceId });
    else          emit({ type: 'noteOn',  pitch: d1, velocity: d2, channel, deviceId });
    return;
  }
  if (status === 0xb0 && d1 === 64) {
    // Control Change 64 = sustain pedal.
    // TODO: hold note-offs while sustain is down. For now we just forward
    // the event so the UI can show a state indicator.
    emit({ type: 'sustain', on: d2 >= 64, channel, deviceId });
    return;
  }
  if (status === 0x80) {
    emit({ type: 'noteOff', pitch: d1, channel, deviceId });
    return;
  }
}

function emit(e: MidiInputEvent): void {
  listeners.forEach((l) => l(e));
}
