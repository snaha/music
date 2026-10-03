import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { formatBuildNotes, readBuildNotes } from './build-notes.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const channel = process.env.MUSIC_CHANNEL === 'preview' ? 'preview' : 'stable';
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
const notes = await readBuildNotes({ channel, branch });
const run = process.env.GITHUB_RUN_NUMBER || '0';
const version = channel === 'preview' ? `${pkg.version}-preview.${run}.${commit.slice(0, 7)}` : pkg.version;
const productName = channel === 'preview' ? 'Music Preview' : 'Music';
const developerSigned = !!process.env.CSC_LINK;
const notarized = developerSigned && !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || '';
if (spotifyClientId && !/^[a-f\d]{32}$/i.test(spotifyClientId)) throw new Error('SPOTIFY_CLIENT_ID must be a 32-character client ID, not a client secret.');
const info = { version, channel, productName, commit, branch, notes, builtAt: new Date().toISOString(), runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '', developerSigned, notarized, spotifyClientId };
await writeFile(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2));
await writeFile(path.join(root, 'builder-config.json'), JSON.stringify({
  ...pkg.build,
  productName, appId: channel === 'preview' ? 'dev.musicapp.desktop.preview' : 'dev.musicapp.desktop',
  extraMetadata: { version, productName, name: channel === 'preview' ? 'music-preview' : pkg.name },
  mac: { ...pkg.build.mac, ...(developerSigned ? {} : { identity: '-', entitlements: 'build/entitlements.adhoc.mac.plist', entitlementsInherit: 'build/entitlements.adhoc.mac.plist' }), notarize: notarized },
}, null, 2));
console.log(`${productName} ${version} (${commit.slice(0, 7)}) · ${notarized ? 'Developer ID + notarization' : developerSigned ? 'Developer ID; no notarization configured' : 'ad-hoc signature; no notarization configured'}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `# ${productName} ${version}\n\nSource: **${branch}** · ${commit}\n\n${formatBuildNotes(notes)}`);
}
