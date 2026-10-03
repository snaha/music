import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(import.meta.dirname, '../../../.audit-results', `chronocity-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const session = process.env.MUSIC_AUDIT_SESSION || 'music-chronocity';
const cli = process.env.MUSIC_AGENT_BROWSER || 'agent-browser';
let started = false;
const run = (...command) => {
  const env = { ...process.env };
  if (started) delete env.AGENT_BROWSER_EXECUTABLE_PATH;
  started = true;
  return execFileSync(cli, ['--session', session, ...command], { encoding: 'utf8', timeout: 30000, env });
};
const evaluate = code => run('eval', code);
const assert = (condition, message) => evaluate(`(() => { if (!(${condition})) throw new Error(${JSON.stringify(message)}); return 'PASS'; })()`);
const button = label => `button[aria-label="${label}"]`;
// The installed CLI's select command rejects its own `values` payload. Exercise the native change event instead.
const selectYear = value => evaluate(`(() => { const field=document.querySelector('select[aria-label="Jump to release year"]'); field.value=${JSON.stringify(value)}; field.dispatchEvent(new Event('change', {bubbles:true})); })()`);

const results = [];
const url = process.env.MUSIC_AUDIT_URL || `http://127.0.0.1:${process.env.MUSIC_AUDIT_PORT || 4178}`;
try {
  if (!process.env.MUSIC_AUDIT_CINEMA_EDGES_ONLY) {
  for (const [width, height] of [[1920,1080], [1440,900], [1024,768], [390,844]]) {
    const size = `${width}x${height}`;
    run('set', 'viewport', String(width), String(height));
    run('open', url);
    run('wait', '.tile-wrap');
    evaluate('document.querySelector(".scroll").scrollTop=600; window.__cityWallScroll=document.querySelector(".scroll").scrollTop');
    run('mouse', 'move', '0', '0');
    run('click', button('Explore albums in 3D'));
    run('wait', '.chronocity[data-ready="true"]');
    assert('!document.querySelector(".scene-message") && !!document.querySelector(".world canvas")', 'A real 3D canvas must render the route');
    assert('document.documentElement.scrollWidth<=innerWidth', 'Chronocity must fit the viewport');
    assert('document.querySelector(".scroll").inert', 'The preserved cover wall must not receive input');
    const backend = JSON.parse(evaluate('document.querySelector(".chronocity").dataset.renderer'));
    assert('document.querySelector(".chronocity").dataset.material==="artwork"', 'Original artwork must be the default');
    run('screenshot', path.join(output, `${size}-city.png`));
    evaluate('window.__cityEntrance=["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()');
    run('click', button('Next album in Chronocity'));
    assert('document.querySelector(".album-title").textContent.includes("Album 054")', 'Next must select the next album immediately');
    run('click', button('Return to the entrance'));
    run('wait', '--fn', '["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join() === window.__cityEntrance');
    evaluate('window.__cityCameraZ=document.querySelector(".chronocity").dataset.cameraZ; window.__cityCameraY=Number(document.querySelector(".chronocity").dataset.cameraY); window.__cityYaw=Number(document.querySelector(".chronocity").dataset.cameraYaw)');
    run('click', button('Move forward'));
    run('wait', '--fn', 'Number(document.querySelector(".chronocity").dataset.cameraZ)<Number(window.__cityCameraZ)-4');
    run('click', button('Rise'));
    run('wait', '--fn', 'Number(document.querySelector(".chronocity").dataset.cameraY)>window.__cityCameraY+2');
    run('click', button('Turn right'));
    run('wait', '--fn', 'Number(document.querySelector(".chronocity").dataset.cameraYaw)>window.__cityYaw+0.3');
    assert('window.__auditCommands.length===0', 'Camera input must not skip or start music');
    run('click', button('Holographic record sleeves'));
    assert('document.querySelector(".chronocity").dataset.material==="holographic"', 'Holographic material must be opt-in');
    run('screenshot', path.join(output, `${size}-holographic.png`));
    run('click', button('Holographic record sleeves'));
    run('click', button('Return to the entrance'));
    evaluate('window.__cityCameraX=Number(document.querySelector(".chronocity").dataset.cameraX)');
    evaluate('document.querySelector(".chronocity").focus(); document.querySelector(".chronocity").dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight",bubbles:true,cancelable:true}))');
    run('wait', '--fn', 'Number(document.querySelector(".chronocity").dataset.cameraX)>window.__cityCameraX+1');
    evaluate('window.dispatchEvent(new KeyboardEvent("keyup", {key:"ArrowRight",bubbles:true}))');
    assert('window.__auditCommands.length===0', 'Held arrow keys must move the camera without reaching global playback shortcuts');
    selectYear('1982');
    assert('document.querySelector(".year").textContent === "1982"', 'Year selection must navigate to the chosen district');
    // Allow the deliberate flight to finish before auditing a background update.
    run('click', button('Return to the entrance'));
    run('wait', '--fn', '["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join() === window.__cityEntrance');
    evaluate('window.__cityPosition=["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join(); window.__cityTitle=document.querySelector(".album-title").textContent; window.__auditRefresh()');
    run('wait', '--fn', 'document.querySelector(".album-meta").textContent.includes("3 tracks")');
    assert('["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()===window.__cityPosition && document.querySelector(".album-title").textContent===window.__cityTitle', 'Background updates must preserve camera position and selection');
    // Reopen the route with sparse metadata using the fixture bridge only.
    evaluate('window.spotify.status().then(status => window.__auditSpotifyStatus({albums:status.albums.map((album,index)=>index===239?{...album,year:undefined}:album)}))');
    run('wait', '--fn', `!!document.querySelector('option[value="undated"]')`);
    selectYear('undated');
    assert('document.querySelector(".year").textContent==="Undated"', 'Missing years must have an honest Undated district');
    run('wait', '.chronocity[data-travelling="false"]');
    run('screenshot', path.join(output, `${size}-undated.png`));
    selectYear('1970');
    run('wait', '.chronocity[data-travelling="false"]');
    run('click', '.album-actions .collection-play');
    run('wait', '--fn', 'window.__auditCommands.some(command=>command[0]==="play")');
    assert('window.__auditCommands.some(command=>command[0]==="play")', 'Chronocity must use the shared playback bridge');
    run('click', '.album-actions .collection-play');
    run('wait', '--fn', 'window.__auditCommands.some(command=>command[0]==="pause")');
    evaluate('window.__cityPlaybackCommands=window.__auditCommands.length');
    run('click', '.album-actions button[aria-label^="Add "]');
    run('wait', '--fn', 'document.querySelector("#player-tab-queue span")?.textContent === "4"');
    assert('window.__auditCommands.length===window.__cityPlaybackCommands', 'Adding to queue must not restart playback');
    run('press', 'Escape');
    run('click', '.album-actions button:nth-child(2)');
    run('wait', '.album-view');
    run('screenshot', path.join(output, `${size}-tracks.png`));
    run('press', 'Escape');
    run('click', button('Explore albums in 3D'));
    assert('!document.querySelector(".scroll").inert && document.querySelector(".scroll").scrollTop===window.__cityWallScroll', 'Returning to the wall must preserve its scroll');
    run('click', button('Explore albums in 3D'));
    assert('document.querySelector(".year").textContent==="1970"', 'View switching must retain the city selection');
    assert('document.querySelector(".chronocity").getBoundingClientRect().top>=document.querySelector(".browse").getBoundingClientRect().bottom-1', 'The city must begin below the toolbar (within one pixel of clientHeight rounding)');
    run('click', '[aria-label="Open Collection type"]');
    run('click', '[role="option"][data-value="playlists"]');
    run('wait', '--fn', 'document.querySelector(".album-title")?.textContent === "Liked Songs"');
    evaluate('window.__cityOriginalTracks=window.spotify.tracks; window.__cityPending=0; window.spotify.tracks=async (...args)=>{window.__cityPending++; await new Promise(resolve=>setTimeout(resolve,450)); try{return await window.__cityOriginalTracks(...args)}finally{window.__cityPending--}}');
    run('click', button('Next album in Chronocity'));
    run('wait', '.chronocity[data-collection="spotify:playlist:artworks"]');
    run('click', button('Return to the entrance'));
    run('wait', '--fn', 'window.__cityPending===0');
    assert('document.querySelector(".chronocity").dataset.collection==="" && document.querySelector(".chronocity").dataset.artworks==="0"', 'Leaving during loading must discard late playlist results');
    evaluate('window.spotify.tracks=window.__cityOriginalTracks');
    run('click', button('Next album in Chronocity'));
    run('wait', '.chronocity[data-artworks="6"][data-travelling="false"]');
    assert('document.querySelector(".collection-heading h2").textContent==="Night flights"', 'Opening a playlist must reveal its own artwork collection');
    assert('document.querySelector(".album-title").textContent==="Afterimage"', 'The first album artwork must retain its actual metadata');
    run('click', button('Animate floating artwork'));
    assert('document.querySelector(".chronocity").dataset.motion==="false"', 'Artwork flight can be paused');
    run('screenshot', path.join(output, `${size}-playlist.png`));
    // Camera tours are opt-in and do not share the artwork-floating switch.
    assert('document.querySelector(".chronocity").dataset.cinematic==="false"', 'Camera tours must start off');
    run('click', button('Cinematic camera tour'));
    run('wait', '.chronocity[data-cinematic="true"][data-camera-phase="orbit"]');
    run('screenshot', path.join(output, `${size}-cinematic-start.png`));
    evaluate('window.__tourStart=Number(document.querySelector(".chronocity").dataset.cameraX)');
    run('wait', '--fn', 'Math.abs(Number(document.querySelector(".chronocity").dataset.cameraX)-window.__tourStart)>1');
    run('screenshot', path.join(output, `${size}-cinematic-arc.png`));
    if (width === 1440) {
      evaluate('window.__tourAlbum=document.querySelector(".chronocity").dataset.selected');
      evaluate('new Promise((resolve,reject)=>{const deadline=Date.now()+25000; const timer=setInterval(()=>{if(document.querySelector(".chronocity").dataset.selected!==window.__tourAlbum){clearInterval(timer);resolve(true);}else if(Date.now()>deadline){clearInterval(timer);reject(new Error("Tour did not advance"));}},100);})');
      assert('document.querySelector(".chronocity").dataset.cinematic==="true"', 'Tour should advance to a neighboring artwork');
      run('screenshot', path.join(output, 'cinematic-next-artwork.png'));
      // Details suspend time without discarding the tour or advancing unseen.
      run('click', '.album-actions button:nth-child(2)'); run('wait', '.album-view');
      evaluate('window.__pausedTour=["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()');
      evaluate('new Promise(resolve=>setTimeout(resolve,500))');
      assert('["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()===window.__pausedTour', 'Overlay must suspend cinematic time');
      run('press', 'Escape');
      run('wait', '--fn', '["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()!==window.__pausedTour');
    }
    run('click', button('Move forward'));
    assert('document.querySelector(".chronocity").dataset.cinematic==="false"', 'Manual movement must stop the director immediately');
    run('wait', '.chronocity[data-camera-phase="manual"]');
    evaluate('window.__stoppedTour=["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()');
    evaluate('new Promise(resolve=>setTimeout(resolve,350))');
    assert('["cameraX","cameraY","cameraZ","cameraYaw"].map(key=>document.querySelector(".chronocity").dataset[key]).join()===window.__stoppedTour', 'Stopped tour must leave the camera where the listener took control');
    run('click', button('Cinematic camera tour')); run('press', 'Escape');
    assert('document.querySelector(".chronocity").dataset.cinematic==="false"', 'Escape must stop the tour');
    // Return selection for the existing next-album assertion.
    selectYear('1980'); run('wait', '.chronocity[data-travelling="false"]');

    run('click', button('Next album in Chronocity'));
    run('wait', '.chronocity[data-travelling="false"]');
    assert('document.querySelector(".album-title").textContent==="Static gardens"', 'An expanded playlist must let the user approach individual albums');
    run('click', '.album-actions button:nth-child(2)'); run('wait', '.album-view');
    assert('document.querySelector(".album-view").textContent.includes("Static gardens")', 'Playlist artwork opens the real album details');
    run('press', 'Escape');
    run('click', button('Return to the entrance'));
    assert('document.querySelector(".chronocity").dataset.artworks==="0"', 'Returning collapses the collection');
    run('click', button('Animate floating artwork'));
    run('click', button('Move forward')); run('click', button('Move forward'));
    run('wait', '.chronocity[data-artworks="1"]');
    assert('document.querySelector(".collection-heading h2").textContent==="Liked Songs"', 'Moving into a playlist must reveal its artwork without a separate open button');
    run('click', button('Return to the entrance'));
    evaluate(`(() => {const field=document.querySelector('select[aria-label="Choose a playlist"]'); field.value="spotify:playlist:restricted"; field.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    run('wait', '.collection-error');
    assert('document.querySelector(".collection-error").textContent.includes("does not expose") && document.querySelector(".chronocity").dataset.artworks==="0"', 'Restricted playlists must report their actual data limitation without fabricated artworks');
    run('click', button('Return to the entrance'));
    const errors = run('errors').trim();
    if (errors) throw new Error(errors);
    results.push({ size, status: 'pass', backend, checks: 'Cinematic arc, manual and Escape interruption, 3D render, depth/height/turn/held-key input, foil toggle, year and Undated jumps, camera refresh stability, shared playback, queue, details, cover-wall scroll, paged playlist artworks, late-load cancellation, proximity expansion, restricted-playlist error' });
    console.log(`${size}: pass (${backend})`);
  }
  // Industrial scenery must leave outer artwork approaches open and stay anchored
  // while the camera crosses the old 170-unit environment boundary.
  run('set', 'viewport', '1440', '900');
  run('open', url); run('wait', '.tile-wrap'); run('click', button('Explore albums in 3D'));
  run('wait', '.chronocity[data-ready="true"]');
  for (let index = 0; index < 20; index++) run('click', button('Next album in Chronocity'));
  run('wait', '.chronocity[data-travelling="false"]');
  run('screenshot', path.join(output, 'outer-slot-20.png'));
  run('click', button('Next album in Chronocity'));
  run('wait', '.chronocity[data-travelling="false"]');
  run('screenshot', path.join(output, 'outer-slot-21.png'));
  run('click', button('Return to the entrance'));
  for (let step = 0; step < 20; step++) run('click', button('Move forward'));
  run('screenshot', path.join(output, 'boundary-before.png'));
  evaluate('window.__boundaryZ=Number(document.querySelector(".chronocity").dataset.cameraZ)');
  run('click', button('Move forward'));
  run('wait', '--fn', 'Number(document.querySelector(".chronocity").dataset.cameraZ)<window.__boundaryZ-4');
  run('screenshot', path.join(output, 'boundary-after.png'));
  for (let step = 0; step < 16; step++) run('click', button('Move forward'));
  run('screenshot', path.join(output, 'streaming-before.png'));
  run('click', button('Move forward'));
  run('screenshot', path.join(output, 'streaming-after.png'));
  results.push({status:'pass', checks:'Outer-slot approaches and room-boundary crossing captured for separate visual inspection'});
  }
  run('set', 'viewport', '1440', '900');
  run('open', url); run('wait', '.tile-wrap');
  // The installed CLI's media command has a daemon protocol mismatch. Drive the
  // same MediaQueryList change contract in-page; native OS emulation is separate.
  evaluate(`(() => {
    const original=window.matchMedia.bind(window), media=original('(prefers-reduced-motion: reduce)');
    let reduced=false; Object.defineProperty(media,'matches',{get:()=>reduced});
    window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?media:original(query);
    window.__auditReducedMotion=value=>{reduced=value;media.dispatchEvent(new Event('change'));};
  })()`);
  run('click', button('Explore albums in 3D'));
  run('wait', '.chronocity[data-ready="true"]');
  run('click', '[aria-label="Open Collection type"]'); run('click', '[role="option"][data-value="playlists"]');
  run('wait', 'select[aria-label="Choose a playlist"]');
  run('click', button('Cinematic camera tour'));
  run('wait', '--fn', 'Number(document.querySelector(".chronocity").dataset.artworks)>0');
  assert('document.querySelector(".chronocity").dataset.cinematic==="true"', 'A tour must reveal playlist members and continue into their gallery');
  run('wait', '.chronocity[data-camera-phase="orbit"]');
  run('screenshot', path.join(output, 'cinematic-playlist-entry.png'));
  evaluate('window.__auditReducedMotion(true)');
  run('wait', '.chronocity[data-cinematic="false"]');
  assert('document.querySelector(".cinematic-toggle").disabled', 'A live reduced-motion preference change must stop the tour');
  results.push({status:'pass', checks:'Cinematic playlist proximity expansion and simulated MediaQueryList reduced-motion interruption'});
  assert('document.querySelector(".cinematic-toggle").disabled && document.querySelector(".chronocity").dataset.cinematic==="false"', 'Reduced motion disables camera tours');
  run('click', button('Move forward'));
  run('click', '.approach');
  run('wait', '.chronocity[data-travelling="false"]');
  run('screenshot', path.join(output, 'reduced-motion.png'));
  results.push({status:'pass', checks:'Reduced-motion preference handler disables tours and preserves manual navigation (simulated MediaQueryList event)'});
  evaluate('window.__auditReducedMotion(false)');
  run('set', 'viewport', '390', '844');
  run('open', `${url}/?chronocity-backend=webgl`);
  run('wait', '.tile-wrap'); run('mouse', 'move', '0', '0'); run('click', button('Explore albums in 3D'));
  run('wait', '.chronocity[data-ready="true"]');
  assert('document.querySelector(".chronocity").dataset.renderer==="webgl"', 'The explicit WebGL2 fallback must initialize');
  run('screenshot', path.join(output, 'webgl-fallback.png'));
  run('click', button('Cinematic camera tour'));
  run('wait', '.chronocity[data-cinematic="true"][data-camera-phase="orbit"]');
  run('screenshot', path.join(output, 'webgl-cinematic.png'));
  run('click', button('Cinematic camera tour'));

  const errors = run('errors').trim(); if (errors) throw new Error(errors);
  results.push({ status: 'pass', backend: 'webgl', checks: 'WebGL2 TSL shader fallback' });
} catch (error) {
  results.push({ status: 'failed', error: error.message });
  try { run('screenshot', path.join(output, 'failure.png')); await writeFile(path.join(output, 'failure-snapshot.txt'), run('snapshot')); } catch {}
  process.exitCode = 1;
} finally {
  try { run('close'); } catch {}
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ automated: results, visualReview: 'pending; inspect captures, no approved Chronocity reference exists' }, null, 2));
  console.log(`Chronocity audit artifacts: ${output}`);
}
