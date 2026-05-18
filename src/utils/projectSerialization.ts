import { z } from 'zod';
import type { Project } from '../types/music';
import { createDefaultProject } from '../store/projectStore';

// ═══════════════════════════════════════════════════════════════════
//  Versioning & migration
//  Bump CURRENT_VERSION whenever the saved shape changes in a way that
//  isn't a superset of the previous schema. Add a migrator that goes
//  from N → N+1 (chain them top-down for older files).
// ═══════════════════════════════════════════════════════════════════
export const CURRENT_VERSION = 1;

// Migration ladder: maps a `from` version to a function producing the next.
const migrators: Record<number, (raw: unknown) => unknown> = {
  // 0 → 1: original draft schema didn't have `colorGroup`, defaulted to ''.
  0: (raw) => {
    const r = raw as { tracks?: Array<{ notes?: unknown[] }> };
    if (Array.isArray(r?.tracks)) {
      for (const t of r.tracks) {
        if (Array.isArray(t.notes)) {
          for (const n of t.notes as Array<Record<string, unknown>>) {
            if (n.colorGroup === undefined) n.colorGroup = undefined;
          }
        }
      }
    }
    return raw;
  },
};

// ═══════════════════════════════════════════════════════════════════
//  Zod schemas — keep loose enough to accept future minor additions
//  (`passthrough` on every object) while still rejecting structural junk.
// ═══════════════════════════════════════════════════════════════════
const timeSignatureSchema = z.object({
  numerator: z.number().int().positive(),
  denominator: z.number().int().positive(),
});

const instrumentSchema = z.object({
  type: z.enum(['synth', 'sampler', 'external']),
  preset: z.string().optional(),
}).passthrough();

const noteSchema = z.object({
  id: z.string().min(1),
  pitch: z.number().int().min(0).max(127),
  startTick: z.number().int().min(0),
  durationTicks: z.number().int().min(1),
  velocity: z.number().int().min(1).max(127),
  muted: z.boolean().optional(),
  selected: z.boolean().optional(),
  colorGroup: z.string().optional(),
  channel: z.number().int().min(1).max(16).optional(),
  trackId: z.string().optional(),
}).passthrough();

const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string(),
  instrument: instrumentSchema,
  channel: z.number().int().min(1).max(16),
  muted: z.boolean(),
  solo: z.boolean(),
  volume: z.number().min(0).max(2),
  pan: z.number().min(-1).max(1),
  notes: z.array(noteSchema),
}).passthrough();

const settingsSchema = z.object({
  bpm: z.number().min(1).max(999),
  ppq: z.number().int().positive(),
  timeSignature: timeSignatureSchema,
  bars: z.number().int().positive(),
  loopStartTick: z.number().int().min(0),
  loopEndTick: z.number().int().min(0),
  snapUnit: z.string(),
  scaleRoot: z.number().int().min(0).max(11),
  scaleName: z.string(),
  scaleSnapEnabled: z.boolean(),
}).passthrough();

const projectSchema = z.object({
  name: z.string(),
  settings: settingsSchema,
  tracks: z.array(trackSchema),
  activeTrackId: z.string().nullable(),
}).passthrough();

const envelopeSchema = z.object({
  schemaVersion: z.number().int().min(0),
  savedAt: z.string().optional(),
  project: projectSchema,
}).passthrough();

// ═══════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════
export interface SerializedEnvelope {
  schemaVersion: number;
  savedAt: string;
  project: Project;
}

/** Wrap a project in the versioned envelope and return a pretty-printed JSON string. */
export function serializeProject(project: Project): string {
  const env: SerializedEnvelope = {
    schemaVersion: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(env, null, 2);
}

/**
 * Parse + validate + migrate. Throws a human-readable error on any failure.
 * The caller decides what to do with the project (replace, etc.).
 */
export function deserializeProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`프로젝트 JSON 형식이 올바르지 않습니다: ${e instanceof Error ? e.message : '파싱 실패'}`);
  }

  // Legacy un-enveloped files (no schemaVersion) — treat as the bare project.
  const envelope = (raw && typeof raw === 'object' && 'schemaVersion' in (raw as object))
    ? raw
    : { schemaVersion: 0, project: raw };

  // Run forward through the migration ladder.
  let working = envelope as { schemaVersion: number; project: unknown };
  while (working.schemaVersion < CURRENT_VERSION) {
    const migrator = migrators[working.schemaVersion];
    if (!migrator) {
      throw new Error(`schemaVersion ${working.schemaVersion} → ${CURRENT_VERSION}의 마이그레이션이 없습니다.`);
    }
    working = {
      schemaVersion: working.schemaVersion + 1,
      project: migrator(working.project),
    };
  }

  const parsed = envelopeSchema.safeParse(working);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`프로젝트 구조 검증 실패: ${first?.path.join('.') || '(root)'} — ${first?.message ?? '알 수 없음'}`);
  }
  const project = parsed.data.project;
  const defaults = createDefaultProject();
  return {
    ...project,
    settings: {
      ...defaults.settings,
      ...project.settings,
    },
  } as unknown as Project;
}

// ═══════════════════════════════════════════════════════════════════
//  Browser download / restore helpers
// ═══════════════════════════════════════════════════════════════════
const LS_KEY = 'rolllab_project_v1';

export function saveToLocalStorage(project: Project): void {
  try {
    localStorage.setItem(LS_KEY, serializeProject(project));
  } catch (e) {
    console.warn('Auto-save 실패:', e);
  }
}

export function readFromLocalStorage(): Project | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return deserializeProject(raw);
  } catch (e) {
    console.warn('자동 저장본 복원 실패:', e);
    return null;
  }
}

export function clearLocalStorage(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

/** Build a downloadable Blob for the current project. */
export function projectToBlob(project: Project): { blob: Blob; fileName: string } {
  const text = serializeProject(project);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fileName = `rolllab-project-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  return { blob: new Blob([text], { type: 'application/json' }), fileName };
}
