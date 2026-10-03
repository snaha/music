import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readBuildNotes } from '../../../desktop/scripts/build-notes.mjs';

const output = path.resolve(import.meta.dirname, '../../../.audit-results', `build-info-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const cli = process.env.MUSIC_AGENT_BROWSER || 'agent-browser';
const args = ['--session', 'music-build-info'];
let started = false;
const run = (...command) => {
  const env = { ...process.env };
  if (started) delete env.AGENT_BROWSER_EXECUTABLE_PATH;
  started = true;
  return execFileSync(cli, [...args, ...command], { encoding: 'utf8', timeout: 30000, env }).trim();
};
const evaluate = code => run('eval', code);
const assert = (condition, message) => evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(message)}); return 'PASS'; })()`);
const notes = await readBuildNotes({ channel: 'preview', branch: 'jose/3d-space' });
const build = { version: '0.5.0-preview.audit', channel: 'preview', branch: 'jose/3d-space', commit: '01a1680756791ea732bc2da7515f92729483fa9f', builtAt: '', runUrl: '', notes };
const results = [];
try {
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844]]) {
    const size = `${width}x${height}`;
    run('set', 'viewport', String(width), String(height));
    run('open', process.env.MUSIC_AUDIT_URL || `http://127.0.0.1:${process.env.MUSIC_AUDIT_PORT || 4178}`);
    run('wait', '.tile-wrap');
    evaluate(`window.__auditDesktopStatus({build:${JSON.stringify(build)}})`);
    if (!evaluate(`document.querySelector('.bar-modes > button').getAttribute('aria-expanded')`).includes('true')) run('click', 'button[aria-label="Choose toolbar mode"]');
    run('click', 'button[aria-label="Settings"]');
    run('click', '#settings-tab-advanced');
    run('wait', '.build-highlights');
    assert(`document.querySelector('.profile-settings').innerText.includes('jose/3d-space')`, 'Settings must identify the source branch');
    assert(`document.querySelector('.build-highlights').innerText.includes(${JSON.stringify(notes.tryIt)}) && document.querySelectorAll('.build-highlights li').length === 3`, 'Settings must show all highlights and how to try them');
    assert(`document.documentElement.scrollWidth <= innerWidth`, 'Settings must fit the viewport');
    run('screenshot', path.join(output, `${size}-settings-top.png`));
    evaluate(`document.querySelector('.settings-dialog .content').scrollTop = document.querySelector('.build-highlights').offsetTop - 150`);
    run('screenshot', path.join(output, `${size}-settings.png`));
    run('press', 'Escape');
    assert(`!document.querySelector('.settings-dialog[open]')`, 'Escape must still dismiss Settings');
    evaluate(`window.__auditDesktopStatus({phase:'setup', profile:{name:'audit',label:'Synthetic audit',directory:'',existing:false,portable:false}})`);
    run('wait', '.startup');
    assert(`document.querySelector('.identity').innerText.includes('From jose/3d-space') && document.querySelector('.build-highlights h2').textContent === ${JSON.stringify(notes.title)}`, 'Startup must identify this preview and the 3D experience');
    assert(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('.startup').scrollWidth <= innerWidth`, 'Startup must fit the viewport');
    run('screenshot', path.join(output, `${size}-startup.png`));
    if (width === 1440) {
      evaluate(`window.__auditDesktopStatus({build:${JSON.stringify({ ...build, notes: undefined, branch: 'other/preview' })}})`);
      assert(`!document.querySelector('.build-highlights') && document.querySelector('.identity').innerText.includes('other/preview')`, 'An undescribed preview must retain branch identity without feature claims');
      evaluate(`window.__auditDesktopStatus({build:${JSON.stringify({ ...build, notes: undefined, channel: 'stable', branch: '' })}})`);
      assert(`!document.querySelector('.build-highlights') && !document.querySelector('.identity').innerText.includes('Music Preview')`, 'Stable builds must retain the existing startup');
      run('screenshot', path.join(output, `${size}-stable.png`));
    }
    results.push({ viewport: size, assertions: 'pass', visual: 'pending separate image inspection' });
  }
} catch (error) {
  results.push({ assertions: 'fail', error: error.message });
  try { run('screenshot', path.join(output, 'failure.png')); } catch {}
  process.exitCode = 1;
} finally {
  try { run('set', 'viewport', '1280', '720'); run('close'); } catch {}
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(output);
}
