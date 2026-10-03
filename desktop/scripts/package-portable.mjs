import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const info = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
const release = path.join(root, 'release');
const platform = process.platform === 'darwin' ? 'mac-arm64' : 'linux-x64';
const name = `Music-${info.channel}-${info.commit.slice(0, 7)}-portable-${platform}`;
const staging = path.join(root, '.portable-build', name);
await rm(path.dirname(staging), { recursive: true, force: true });
await mkdir(path.join(staging, 'Data'), { recursive: true, mode: 0o700 });
await writeFile(path.join(staging, 'Data', '.keep'), '');
if (process.platform === 'darwin') {
  const bundle = `${info.productName}.app`;
  await cp(path.join(release, 'mac-arm64', bundle), path.join(staging, bundle), { recursive: true, verbatimSymlinks: true });
  const executable = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(staging, bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
  await writeFile(path.join(staging, 'Open Music.command'), `#!/bin/zsh\nset -eu\nmusic_preview_dir="$(cd -- "$(dirname -- "$0")" && pwd)"\nexec "$music_preview_dir/${bundle}/Contents/MacOS/${executable}" --data-dir "$music_preview_dir/Data" "$@"\n`, { mode: 0o755 });
} else {
  const candidates = (await readdir(release)).filter(file => file.endsWith('.AppImage') && file.includes(info.version));
  if (candidates.length !== 1) throw new Error('Build exactly one AppImage for the current version before making a portable package.');
  const [appImage] = candidates;
  await cp(path.join(release, appImage), path.join(staging, appImage));
  await writeFile(path.join(staging, 'Open Music.sh'), `#!/bin/sh\nset -eu\nmusic_preview_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexport APPIMAGE_EXTRACT_AND_RUN=1\nexec "$music_preview_dir/${appImage}" --data-dir "$music_preview_dir/Data" "$@"\n`, { mode: 0o755 });
}
const readme = `# ${info.productName} ${info.version}

Build: ${info.commit}
Branch: ${info.branch}

## Open this portable preview

Extract this entire folder to a writable location. ${process.platform === 'darwin' ? 'Double-click Open Music.command. Open the launcher, rather than the app inside it, to use the adjacent Data folder.' : 'Run ./Open\\ Music.sh. The launcher extracts the AppImage at runtime, so FUSE is not required.'}

The launcher keeps library indexes, history, preferences and Spotify cache in Data/profiles/. Audio files remain in the music folder you choose.

Fresh startup selects your Music folder. Add custom music folders, choose Open my library, or Explore first. Spotify is optional in Settings. If Music already exists on this computer, quit it before choosing Copy existing profile. Spotify may need reconnecting.

Settings → Advanced → Library & profile shows the build and data folder and lets you create or switch profiles.

## Compare builds or update

For an update, quit the preview and replace only the app${process.platform === 'darwin' ? ' bundle' : ' image'}, keeping Data and the launcher. To compare versions, duplicate the whole folder before replacing the app in one copy. Each copied Data folder is independent. Never point two running versions at the same profile.

## What stays on this computer

Spotify credentials depend on the operating system's secure storage. Moving this folder to another computer may require reconnecting Spotify and choosing a new music-folder path. Permissions may need granting again.

${process.platform === 'darwin' && !info.notarized ? 'This build is not notarized. macOS may block the first launch. Follow Apple’s guidance at https://support.apple.com/en-us/102445 and only open builds you trust.\n' : ''}
Spotify development-mode testers must be allowlisted for the client ID they use. Connect your own account; no personal library or login is included in this download.
`;
await writeFile(path.join(staging, 'README.md'), readme);
await writeFile(path.join(release, `Music-${info.channel}-${info.commit.slice(0, 7)}-${platform}-README.md`), readme);
const archive = path.join(release, name + (process.platform === 'darwin' ? '.zip' : '.tar.gz'));
if (process.platform === 'darwin') execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', staging, archive], { stdio: 'inherit' });
else execFileSync('tar', ['-czf', archive, '-C', path.dirname(staging), name], { stdio: 'inherit' });
const checksum = createHash('sha256').update(await readFile(archive)).digest('hex');
console.log(`${checksum}  ${path.basename(archive)}`);
await rm(path.dirname(staging), { recursive: true, force: true });
