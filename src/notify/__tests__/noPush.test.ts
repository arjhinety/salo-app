/**
 * Guard for the local-only rule (CC-12, coordinator decision). This fails if:
 * (a) a google-services.json exists anywhere in the repo outside node_modules, or app.json / app.config.* references
 *     googleServicesFile; or
 * (b) any source under src/ calls a push-token API.
 * expo-notifications stays in the app for local notifications. Its Android build carries the firebase-messaging library,
 * but the app never asks for a push token, so push is never initialised (see the handoff).
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, extname } from 'path';

const ROOT = resolve(__dirname, '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git']);
const PUSH_APIS = ['getExpoPushTokenAsync', 'getDevicePushTokenAsync', 'addPushTokenListener'];

function walk(dir: string, visit: (path: string) => void): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}

describe('local notifications only: no push service configuration', () => {
  it('no google-services.json anywhere in the repo outside node_modules', () => {
    const found: string[] = [];
    walk(ROOT, (path) => {
      if (/^google-services\.json$/i.test(path.split(/[\\/]/).pop() ?? '')) found.push(path);
    });
    expect(found).toEqual([]);
  });

  it('app.json and app.config.* do not reference googleServicesFile', () => {
    const offenders: string[] = [];
    walk(ROOT, (path) => {
      const name = path.split(/[\\/]/).pop() ?? '';
      const isConfig = name === 'app.json' || /^app\.config\.(js|ts|json)$/.test(name);
      if (!isConfig) return;
      if (readFileSync(path, 'utf8').includes('googleServicesFile')) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it('no source under src/ calls a push-token API', () => {
    const self = __filename;
    const offenders: string[] = [];
    walk(join(ROOT, 'src'), (path) => {
      if (path === self) return;
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(extname(path))) return;
      const text = readFileSync(path, 'utf8');
      for (const api of PUSH_APIS) if (text.includes(api)) offenders.push(`${path}: ${api}`);
    });
    expect(offenders).toEqual([]);
  });
});
