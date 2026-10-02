import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const info = JSON.parse(readFileSync(path.join(root, 'build-info.json'), 'utf8'));
const args = ['exec', 'electron-builder', '--config', 'builder-config.json', '--mac'];
if (process.argv.includes('--dir')) args.push('--arm64', '--dir');
else args.push('dmg', 'zip', '--arm64', '--prepackaged', path.join('release', 'mac-arm64', `${info.productName}.app`));
args.push('--publish', 'never');
// GitHub exports absent secrets as empty strings. The signing importer treats
// an empty CSC_LINK as the current directory instead of as an absent certificate.
const environment = { ...process.env };
for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
  if (!environment[key]) delete environment[key];
}
execFileSync('pnpm', args, { cwd: root, env: environment, stdio: 'inherit' });
