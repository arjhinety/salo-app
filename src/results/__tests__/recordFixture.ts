// The stored main-run record (M6_MAIN=1, docs/reports/m6-main/record.json) as a test fixture. Only tests load it. The app
// never does (src/results/__tests__/record-imports.test.ts), so the record is not in the build.
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PersistedMainResults } from '../persisted';

export const RECORD_PATH = join(__dirname, '..', '..', '..', 'docs', 'reports', 'm6-main', 'record.json');

export function loadRecord(): PersistedMainResults {
  return JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as PersistedMainResults;
}
