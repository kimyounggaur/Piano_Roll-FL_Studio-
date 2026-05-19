// ═══════════════════════════════════════════════════════════════════
//  musicXmlFile.ts — MusicXML (3.1, partwise) + compressed .mxl export
//
//  Pragmatic, lossy-on-complex-polyphony serializer:
//   • one <part> per track
//   • notes are grouped into chords when they share startTick within a track
//   • rests are inserted to fill gaps between chord groups
//   • each part is split into <measure>s using project.settings.timeSignature
//   • divisions = ppq, so all durations are in raw ticks
// ═══════════════════════════════════════════════════════════════════

import type { Project, Note, Track } from '../types/music';

const NOTE_LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'] as const;
const NOTE_ALTERS  = [0,   1,   0,   1,   0,   0,   1,   0,   1,   0,   1,   0  ] as const;

// ─────────────────────────────────────────────────────────────────────────
//  Public types
// ─────────────────────────────────────────────────────────────────────────

export interface MusicXmlExportOptions {
  /** Skip every note where `muted === true`. Default true. */
  excludeMutedNotes?: boolean;
  /** Skip every track where `muted === true`. Default true. */
  excludeMutedTracks?: boolean;
  /**
   * If provided, only notes whose colorGroup (parsed as a number) is in
   * this list are exported. `0` matches notes without an explicit group
   * (no colorGroup field, or colorGroup === '0').
   */
  colorGroups?: number[];
  /** File-name override (without extension). */
  fileName?: string;
}

// ─────────────────────────────────────────────────────────────────────────
//  Note filtering
// ─────────────────────────────────────────────────────────────────────────

/** True when the note passes the configured filters (mute + colorGroup). */
function passesFilter(n: Note, opts: MusicXmlExportOptions): boolean {
  if (opts.excludeMutedNotes !== false && n.muted) return false;
  if (opts.colorGroups && opts.colorGroups.length > 0) {
    const g = parseColorGroup(n.colorGroup);
    if (!opts.colorGroups.includes(g)) return false;
  }
  return true;
}

/** Returns the group index a note belongs to. Missing/empty/'0' → 0. */
function parseColorGroup(raw: string | undefined | null): number {
  if (raw == null || raw === '') return 0;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────────────────
//  MusicXML body construction
// ─────────────────────────────────────────────────────────────────────────

interface ChordGroup {
  startTick: number;
  durationTicks: number;
  pitches: number[];
}

/** Group simultaneous notes (same startTick) into chord clusters. */
function chordGroups(notes: Note[]): ChordGroup[] {
  if (notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) =>
    a.startTick - b.startTick || a.pitch - b.pitch,
  );
  const groups: ChordGroup[] = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.startTick === n.startTick) {
      last.pitches.push(n.pitch);
      // Chord duration = duration of the longest note in the group
      if (n.durationTicks > last.durationTicks) {
        last.durationTicks = n.durationTicks;
      }
    } else {
      groups.push({
        startTick: n.startTick,
        durationTicks: Math.max(1, n.durationTicks),
        pitches: [n.pitch],
      });
    }
  }
  return groups;
}

interface MeasureEvent {
  kind: 'note' | 'rest';
  /** Length within this measure (ticks). */
  duration: number;
  /** Only for 'note' — chord pitches in this slice. */
  pitches?: number[];
  /** Only for 'note' — true if this chord continues from the prior measure (tied-in). */
  tieFromPrev?: boolean;
  /** Only for 'note' — true if this chord continues into the next measure (tied-out). */
  tieToNext?: boolean;
}

/**
 * Slice a part's chord groups into per-measure event lists, splitting any
 * group that crosses a measure barline into two tied events.
 */
function sliceIntoMeasures(
  groups: ChordGroup[],
  ticksPerMeasure: number,
  totalMeasures: number,
): MeasureEvent[][] {
  const measures: MeasureEvent[][] = Array.from({ length: totalMeasures }, () => []);
  let cursorTick = 0;

  // Linearised stream: each group → one or more (measure, slice)
  // Fill rests in-between by tracking cursorTick.
  for (const g of groups) {
    // Rest from cursor → g.startTick
    let restTicks = g.startTick - cursorTick;
    while (restTicks > 0) {
      const mIdx = Math.floor(cursorTick / ticksPerMeasure);
      if (mIdx >= totalMeasures) break;
      const measureEnd = (mIdx + 1) * ticksPerMeasure;
      const take = Math.min(restTicks, measureEnd - cursorTick);
      if (take > 0) {
        measures[mIdx].push({ kind: 'rest', duration: take });
        cursorTick += take;
        restTicks  -= take;
      } else break;
    }
    cursorTick = Math.max(cursorTick, g.startTick);

    // Now lay down the chord, splitting at measure boundaries
    let remaining = g.durationTicks;
    let crossedAlready = false;
    while (remaining > 0) {
      const mIdx = Math.floor(cursorTick / ticksPerMeasure);
      if (mIdx >= totalMeasures) break;
      const measureEnd = (mIdx + 1) * ticksPerMeasure;
      const take = Math.min(remaining, measureEnd - cursorTick);
      const willCross = take < remaining;
      measures[mIdx].push({
        kind: 'note',
        duration: take,
        pitches: g.pitches,
        tieFromPrev: crossedAlready,
        tieToNext:   willCross,
      });
      cursorTick += take;
      remaining  -= take;
      crossedAlready = true;
    }
  }

  // Trailing rests to fill final measure
  while (cursorTick < totalMeasures * ticksPerMeasure) {
    const mIdx = Math.floor(cursorTick / ticksPerMeasure);
    if (mIdx >= totalMeasures) break;
    const measureEnd = (mIdx + 1) * ticksPerMeasure;
    const take = measureEnd - cursorTick;
    measures[mIdx].push({ kind: 'rest', duration: take });
    cursorTick = measureEnd;
  }

  return measures;
}

// ─────────────────────────────────────────────────────────────────────────
//  XML emission
// ─────────────────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pitchElement(midi: number): string {
  const pc      = ((midi % 12) + 12) % 12;
  const step    = NOTE_LETTERS[pc];
  const alter   = NOTE_ALTERS[pc];
  const octave  = Math.floor(midi / 12) - 1;
  const alterXml = alter ? `      <alter>${alter}</alter>\n` : '';
  return `    <pitch>\n      <step>${step}</step>\n${alterXml}      <octave>${octave}</octave>\n    </pitch>`;
}

function noteElement(midi: number, duration: number, isChord: boolean, tieFromPrev?: boolean, tieToNext?: boolean): string {
  const chord = isChord ? '    <chord/>\n' : '';
  const ties: string[] = [];
  const notations: string[] = [];
  if (tieFromPrev) { ties.push('<tie type="stop"/>');  notations.push('<tied type="stop"/>'); }
  if (tieToNext)   { ties.push('<tie type="start"/>'); notations.push('<tied type="start"/>'); }
  const tieXml = ties.length ? '    ' + ties.join('\n    ') + '\n' : '';
  const notationsXml = notations.length
    ? `    <notations>\n      ${notations.join('\n      ')}\n    </notations>\n`
    : '';
  return [
    '  <note>',
    chord.trimEnd(),
    pitchElement(midi),
    `    <duration>${duration}</duration>`,
    tieXml.trimEnd(),
    '    <voice>1</voice>',
    notationsXml.trimEnd(),
    '  </note>',
  ].filter(Boolean).join('\n');
}

function restElement(duration: number): string {
  return [
    '  <note>',
    '    <rest/>',
    `    <duration>${duration}</duration>`,
    '    <voice>1</voice>',
    '  </note>',
  ].join('\n');
}

function buildPart(track: Track, partId: string, project: Project, opts: MusicXmlExportOptions): string {
  const { ppq, timeSignature, bars } = project.settings;
  const ticksPerMeasure = Math.max(1, Math.round(ppq * (4 / timeSignature.denominator) * timeSignature.numerator));
  const totalMeasures   = Math.max(1, bars);

  const filtered = track.notes.filter((n) => passesFilter(n, opts));
  const groups   = chordGroups(filtered);
  const measures = sliceIntoMeasures(groups, ticksPerMeasure, totalMeasures);

  const measureXml = measures.map((evs, idx) => {
    const isFirst = idx === 0;
    const attrs = isFirst ? [
      '  <attributes>',
      `    <divisions>${ppq}</divisions>`,
      '    <key><fifths>0</fifths></key>',
      `    <time><beats>${timeSignature.numerator}</beats><beat-type>${timeSignature.denominator}</beat-type></time>`,
      '    <clef><sign>G</sign><line>2</line></clef>',
      '  </attributes>',
    ].join('\n') : '';

    const events = evs.map((ev) => {
      if (ev.kind === 'rest') return restElement(ev.duration);
      const pitches = ev.pitches ?? [];
      return pitches.map((p, i) =>
        noteElement(p, ev.duration, i > 0, ev.tieFromPrev, ev.tieToNext),
      ).join('\n');
    }).join('\n');

    return `<measure number="${idx + 1}">\n${[attrs, events].filter(Boolean).join('\n')}\n</measure>`;
  }).join('\n');

  return `<part id="${partId}">\n${measureXml}\n</part>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  Public — generate MusicXML string
// ─────────────────────────────────────────────────────────────────────────

export function buildMusicXml(project: Project, opts: MusicXmlExportOptions = {}): string {
  const tracks = project.tracks.filter((t) => !(opts.excludeMutedTracks !== false && t.muted));

  const partList = tracks.map((t, i) => {
    const id = `P${i + 1}`;
    return `  <score-part id="${id}"><part-name>${xmlEscape(t.name)}</part-name></score-part>`;
  }).join('\n');

  const parts = tracks.map((t, i) => buildPart(t, `P${i + 1}`, project, opts)).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    `  <work><work-title>${xmlEscape(project.name || 'Untitled')}</work-title></work>`,
    '  <part-list>',
    partList,
    '  </part-list>',
    parts,
    '</score-partwise>',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
//  Public — blob exports
// ─────────────────────────────────────────────────────────────────────────

export function exportMusicXml(project: Project, opts: MusicXmlExportOptions = {}): { blob: Blob; fileName: string } {
  const xml = buildMusicXml(project, opts);
  const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
  return { blob, fileName: (opts.fileName ? opts.fileName : defaultBase()) + '.musicxml' };
}

export function exportMxl(project: Project, opts: MusicXmlExportOptions = {}): { blob: Blob; fileName: string } {
  const xml = buildMusicXml(project, opts);
  const container = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<container>',
    '  <rootfiles>',
    '    <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>',
    '  </rootfiles>',
    '</container>',
    '',
  ].join('\n');

  const zip = buildStoreZip([
    { path: 'META-INF/container.xml', content: container },
    { path: 'score.musicxml',         content: xml       },
  ]);
  const blobBytes = new Uint8Array(zip.byteLength);
  blobBytes.set(zip);
  const blob = new Blob([blobBytes], { type: 'application/vnd.recordare.musicxml' });
  return { blob, fileName: (opts.fileName ? opts.fileName : defaultBase()) + '.mxl' };
}

function defaultBase(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rolllab-project-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─────────────────────────────────────────────────────────────────────────
//  Minimal store-only ZIP encoder
//  Just enough to package an MXL — no compression, no extra fields.
//  Spec: APPNOTE.TXT 4.3.6 / 4.3.7.
// ─────────────────────────────────────────────────────────────────────────

interface ZipEntry { path: string; content: string }

function buildStoreZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  type Record = {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    localOffset: number;
  };

  const records: Record[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.path);
    const dataBytes = enc.encode(e.content);
    const crc       = crc32(dataBytes);
    const localOffset = offset;

    // Local file header (30 bytes + name + extra(0))
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0,  0x04034b50, true);  // signature
    dv.setUint16(4,  20, true);          // version
    dv.setUint16(6,  0, true);           // flags
    dv.setUint16(8,  0, true);           // method = store
    dv.setUint16(10, 0, true);           // mod time
    dv.setUint16(12, 0, true);           // mod date
    dv.setUint32(14, crc, true);         // crc32
    dv.setUint32(18, dataBytes.length, true);  // compressed size
    dv.setUint32(22, dataBytes.length, true);  // uncompressed size
    dv.setUint16(26, nameBytes.length, true);  // name len
    dv.setUint16(28, 0, true);                  // extra len
    local.set(nameBytes, 30);

    chunks.push(local, dataBytes);
    offset += local.length + dataBytes.length;
    records.push({ nameBytes, dataBytes, crc, localOffset });
  }

  // Central directory
  const cdStart = offset;
  for (const r of records) {
    const cd = new Uint8Array(46 + r.nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0,  0x02014b50, true);  // signature
    dv.setUint16(4,  20, true);          // version made by
    dv.setUint16(6,  20, true);          // version needed
    dv.setUint16(8,  0,  true);          // flags
    dv.setUint16(10, 0,  true);          // method
    dv.setUint16(12, 0,  true);          // mod time
    dv.setUint16(14, 0,  true);          // mod date
    dv.setUint32(16, r.crc, true);
    dv.setUint32(20, r.dataBytes.length, true);
    dv.setUint32(24, r.dataBytes.length, true);
    dv.setUint16(28, r.nameBytes.length, true);
    dv.setUint16(30, 0,  true);          // extra
    dv.setUint16(32, 0,  true);          // comment
    dv.setUint16(34, 0,  true);          // disk number
    dv.setUint16(36, 0,  true);          // internal attrs
    dv.setUint32(38, 0,  true);          // external attrs
    dv.setUint32(42, r.localOffset, true);
    cd.set(r.nameBytes, 46);
    chunks.push(cd);
    offset += cd.length;
  }
  const cdSize = offset - cdStart;

  // End of central directory
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0,  0x06054b50, true);
  dv.setUint16(4,  0,  true);            // disk
  dv.setUint16(6,  0,  true);            // start disk
  dv.setUint16(8,  records.length, true);
  dv.setUint16(10, records.length, true);
  dv.setUint32(12, cdSize, true);
  dv.setUint32(16, cdStart, true);
  dv.setUint16(20, 0,  true);            // comment len
  chunks.push(eocd);

  // Concatenate
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// Standard CRC-32 (poly 0xEDB88320), table-driven.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
