import { describe, it } from 'vitest';
import { runNoteTransformChecks } from './noteTransforms.test';

// Custom-framework checks live in noteTransforms.test.ts; this thin wrapper
// surfaces them under vitest as a single test case. Each `expect…` inside
// runNoteTransformChecks throws on failure, which vitest reports as the
// failing assertion.
describe('noteTransforms (custom-framework checks)', () => {
  it('quantize / humanize / strum / arpeggiate', () => {
    runNoteTransformChecks();
  });
});
