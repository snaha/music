import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(import.meta.dirname, '../../../.audit-results', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const cli = process.env.MUSIC_AGENT_BROWSER || 'agent-browser';
const args = ['--session', 'music-regressions'];
let started = false;
const run = (...command) => {
  const env = { ...process.env };
  if (started) delete env.AGENT_BROWSER_EXECUTABLE_PATH;
  started = true;
  return execFileSync(cli, [...args, ...command], { encoding: 'utf8', timeout: 30000, env });
};
const evaluate = code => run('eval', code);
const assert = (condition, message) => evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(message)}); return 'PASS'; })()`);
const button = name => `button[aria-label="${name}"]`;
const capture = (size, name) => run('screenshot', path.join(output, `${size}-${name}.png`));
const results = [];
try {
  for (const [width, height] of [[1920,1080], [1440,900], [1024,768], [390,844]]) {
    const size = `${width}x${height}`;
    run('set', 'viewport', String(width), String(height));
    run('open', process.env.MUSIC_AUDIT_URL || 'http://127.0.0.1:4178');
    run('wait', '.tile-wrap');
    run('mouse', 'move', '0', '0');
    run('wait', '200');
    assert(`getComputedStyle(document.querySelector('.tile-info')).opacity === '0'`, 'Details must be hidden initially');
    run('hover', '.tile-wrap:first-child');
    run('wait', '200');
    assert(`getComputedStyle(document.querySelector('.tile-info')).opacity === '1'`, 'Hover must reveal details');
    assert(`(() => { const el=document.querySelector('.tile-actions button'); const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })()`, 'Artwork must not obscure detail actions');
    run('mouse', 'move', '0', '0');
    run('focus', '.tile-wrap:first-child .tile-actions button[aria-label^="Show tracks"]');
    run('wait', '200');
    assert(`getComputedStyle(document.querySelector('.tile-info')).opacity === '1'`, 'Keyboard focus must reveal details');
    capture(size, 'card-focus');
    run('click', '.tile-wrap:first-child .tile');
    run('wait', '300');
    assert(`window.__auditCommands.some(c=>c[0]==='play')`, 'Cover must play included tracks');
    run('wait', '500');
    run('click', button('Pause'));
    const commandsBeforeDiscovery = run('eval', 'window.__auditCommands.length').trim();
    run('click', '.discovery-action');
    assert(`document.querySelector('.discovered') !== null && window.__auditCommands.length === ${commandsBeforeDiscovery}`, 'Discovery must reveal a cover without starting playback');

    assert(`!document.querySelector('[aria-label="Filter by artist"]')`, 'Secondary filters must be hidden initially');
    run('click', button('Library filters'));
    run('fill', '[aria-label="Filter by artist"]', 'zzzz-no-artist');
    run('wait', '100');
    assert(`document.querySelector('[aria-label="Filter by artist"]').getAttribute('aria-expanded')==='true' && document.body.innerText.includes('No matches')`, 'Typing must open no-match results');
    run('press', 'Escape');
    assert(`document.querySelector('[aria-label="Filter by artist"]').value==='All artists'`, 'Escape must restore the selected label');
    run('fill', '[aria-label="Filter by artist"]', 'Bowie');
    capture(size, 'artist-dropdown');
    run('click', '[role="option"]');
    assert(`document.querySelector('[aria-label="Filter by artist"]').value==='David Bowie'`, 'Artist selection must apply');
    run('click', button('Reset filters'));
    run('click', button('Settings'));
    run('wait', '500');
    assert(`document.querySelector(${JSON.stringify(button('Settings'))}).getAttribute('aria-pressed')==='true'`, 'Settings must show selected state');
    capture(size, 'settings');
    run('scrollintoview', '.body section:last-child');
    assert(`document.documentElement.scrollWidth<=innerWidth`, 'Settings must fit the window');
    run('click', button('Settings'));
    run('click', button('Show display controls'));
    run('click', '.controls button[aria-pressed]');
    run('focus', '[aria-label="Album columns"] [role="slider"]');
    run('press', 'ArrowRight');
    assert(`document.querySelector('[aria-label="Album columns"] [role="slider"]').getAttribute('aria-valuenow')==='4'`, 'Advanced columns slider must answer keyboard input');
    run('press', 'ArrowLeft');
    capture(size, 'advanced-layout');
    run('click', '.controls button[aria-pressed]');
    run('hover', button('Display menu'));
    assert(`document.querySelector(${JSON.stringify(button('Display menu'))}).getAttribute('aria-expanded')==='false'`, 'Menu must not open on hover');
    run('click', button('Display menu'));
    capture(size, 'display-menu');
    run('click', '[aria-label="Display options"] [role="menuitem"]:nth-child(5)');
    run('wait', '200');
    for (const [index, style] of [[1,'classic'],[3,'neon'],[2,'studio']]) {
      run('click', `.style-card:nth-of-type(${index})`);
      assert(`document.documentElement.dataset.components===${JSON.stringify(style)}`, 'Component style must apply');
      capture(size, `components-${style}`);
    }
    run('click', button('Close component styles'));
    run('click', button('Display menu'));
    run('press', 'ArrowDown');
    run('press', 'Escape');
    assert(`document.activeElement.getAttribute('aria-label')==='Display menu'`, 'Escape must return focus to menu trigger');
    run('click', button('Show display controls'));
    run('hover', '.tile-wrap:first-child');
    run('click', '.tile-wrap:first-child button[aria-label^="Show tracks"]');
    run('wait', '500');
    assert(`Array.from(document.querySelectorAll('section')).every(e=>e.scrollWidth<=e.clientWidth)`, 'Track details must not overflow');
    capture(size, 'track-details');
    run('click', button('Close'));
    run('wait', '500');
    evaluate(`document.querySelector('.scroll').scrollTop=2000`);
    run('wait', '200');
    evaluate(`window.__beforeScroll=document.querySelector('.scroll').scrollTop; window.__beforeTitles=Array.from(document.querySelectorAll('.tile img')).map(e=>e.alt); window.__auditRefresh()`);
    run('wait', '200');
    assert(`document.querySelector('.scroll').scrollTop===window.__beforeScroll && JSON.stringify(Array.from(document.querySelectorAll('.tile img')).map(e=>e.alt))===JSON.stringify(window.__beforeTitles)`, 'Background refresh must preserve scroll and tile order');
    assert(`document.documentElement.scrollWidth<=innerWidth`, 'Page must not overflow horizontally');
    results.push({ size, status: 'passed' });
    console.log(`${size}: passed`);
  }
} catch (error) {
  results.push({ status: 'failed', error: error.message });
  try { run('screenshot', path.join(output, 'failure.png')); await writeFile(path.join(output, 'failure-snapshot.txt'), run('snapshot')); } catch {}
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ automated: results, visualReview: 'pending; inspect screenshots against approved references' }, null, 2));
  try { run('close'); } catch {}
  console.log(`Audit artifacts: ${output}`);
}
