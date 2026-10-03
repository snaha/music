import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileStations, releaseYear, spatialIndex, approach } from '../src/lib/chronocity/layout.ts';
import type { Collection } from '../src/lib/music';
const album = (id: string, year?: number): Collection => ({ id, rawId: id, title: id, year, source: 'local', kind: 'album', sub: 'Artist', cover: '', count: 2, available: true });
const yearOf = (collection: Collection) => collection.year;
test('release years order the archive, unknown years remain unknown, and records occupy depth and height', () => {
  const stations = reconcileStations([], [album('undated'), album('later', 1990), album('early', 1982), album('zero', 0)], yearOf);
  assert.deepEqual(stations.map(station => [station.album.id, station.year]), [['early', 1982], ['later', 1990], ['undated', null], ['zero', null]]);
  assert.equal(new Set(stations.map(station => station.z)).size, 4);
  assert.equal(new Set(stations.map(station => station.y)).size, 4);
  for (const value of [NaN, -1, 0, 1.5, 10000]) assert.equal(releaseYear(value), null);
});
test('metadata refresh and removal preserve physical addresses; explicit filtering can rebuild', () => {
  const initial = reconcileStations([], [album('b', 1982), album('c', 1982)], yearOf);
  const refreshed = reconcileStations(initial, [album('a', 1970), { ...album('b', 1983), cover: '/new.jpg' }, album('c', 1982)], yearOf);
  assert.deepEqual(refreshed.map(station => station.album.id), ['b', 'c', 'a']);
  for (const axis of ['x', 'y', 'z', 'yaw', 'slot'] as const) assert.equal(refreshed[0][axis], initial[0][axis]);
  assert.equal(refreshed[0].year, 1983);
  assert.equal(refreshed[0].album.cover, '/new.jpg');
  const removed = reconcileStations(refreshed, [album('c', 1982), album('a', 1970)], yearOf);
  assert.equal(removed[0].slot, initial[1].slot);
  assert.deepEqual(reconcileStations(refreshed, refreshed.map(station => station.album), yearOf, true).map(station => station.album.id), ['a', 'c', 'b']);
});
test('large catalogs have unique addresses, bounded nearby queries and reachable approach targets', () => {
  const stations = reconcileStations([], Array.from({length: 9000}, (_, i) => album(String(i).padStart(5, '0'))), yearOf);
  assert.equal(new Set(stations.map(({x,y,z}) => `${x},${y},${z}`)).size, 9000);
  const query = spatialIndex(stations);
  for (const station of [stations[0], stations[24], stations[8999]]) {
    const target = approach(station);
    assert.ok(Math.abs(Math.hypot(target.x - station.x, target.z - station.z) - 17) < 0.001);
    const nearby = query(target, 16);
    assert.ok(nearby.length <= 16 && nearby.some(found => found.album.id === station.album.id));
  }
  assert.deepEqual(query({x: 100000, y: 10, z: 100000}), []);
});

import { artworkFlight, playlistArtworks, playlistStations } from '../src/lib/chronocity/artworks.ts';
import type { Track } from '../src/lib/music';
const track = (id: string, info?: Collection): Track => ({ id, rawId: id, source: 'local', title: id, cover: info?.cover ?? '', available: true, albumInfo: info, albumId: info?.id, album: info?.title });
test('playlist artworks deduplicate actual album identity, retain different editions, and never infer missing identities', () => {
  const a = {...album('edition-a', 1982), cover:'/original-a.jpg'}, b = {...album('edition-b', 1992), title:a.title, cover:'/original-b.jpg'};
  const result = playlistArtworks([track('1',a), track('2',a), track('3',b), track('unknown')]);
  assert.deepEqual(result.map(item => [item.id,item.cover]), [['edition-a','/original-a.jpg'],['edition-b','/original-b.jpg']]);
  const sparse = playlistArtworks([{...track('1'),albumId:'local:album:raw-a'}, {...track('2'),albumId:'local:album:raw-a'}]);
  assert.equal(sparse[0].rawId,'raw-a'); assert.equal(sparse[0].count,2); assert.equal(sparse[0].year,undefined); assert.equal(sparse[0].incomplete,true);
});
test('playlist pages append stable artwork positions and flight remains bounded in all three dimensions', () => {
  const parent = reconcileStations([], [{...album('playlist'),kind:'playlist'}], yearOf)[0];
  const initial = playlistStations(parent,[album('a'),album('b')]);
  assert.deepEqual(playlistStations(parent,[album('a'),album('b'),album('c')]).slice(0,2),initial);
  const station = initial[0];
  for (const time of [0,1,10,100,10000]) {
    const flight = artworkFlight(station,time);
    assert.ok(Math.abs(flight.x-station.x)<=4 && Math.abs(flight.y-station.y)<=2.4 && Math.abs(flight.z-station.z)<=6);
    const still = artworkFlight(station,time,0);
    assert.equal(still.x,station.x); assert.equal(still.y,station.y); assert.equal(still.z,station.z); assert.equal(still.yaw,station.yaw); assert.ok(still.pitch === 0 && still.roll === 0);
  }
  assert.notEqual(artworkFlight(station,0).z,artworkFlight(station,10).z);
});

import { cameraShot, sampleShot, orbitPose, orbitSeconds, nextTourStation } from '../src/lib/chronocity/cinema.ts';
test('cinematic shots start at the current pose, take the shortest turn and join a bounded front arc without a cut', () => {
  const station = { ...reconcileStations([], [album('cover')], yearOf)[0], yaw: -Math.PI + 0.1 };
  for (const narrow of [false, true]) {
    const from = {x: 12, y: 15, z: 30, yaw: Math.PI - 0.1, pitch: 0.1};
    const shot = cameraShot(from, station, narrow);
    assert.deepEqual(sampleShot(shot, 0), from);
    const before = sampleShot(shot, shot.approachSeconds - 0.001);
    const arrival = sampleShot(shot, shot.approachSeconds);
    assert.ok(Math.hypot(before.x-arrival.x, before.y-arrival.y, before.z-arrival.z) < 0.00001);
    assert.ok(Math.abs(sampleShot(shot, shot.approachSeconds / 2).yaw - from.yaw) < 0.3);
    for (let time = 0; time <= orbitSeconds; time += 0.1) {
      const pose = orbitPose(station, time, narrow);
      assert.ok(Object.values(pose).every(Number.isFinite));
      const forward = (pose.x - station.x) * Math.sin(station.yaw) + (pose.z - station.z) * Math.cos(station.yaw);
      const lateral = (pose.x - station.x) * Math.cos(station.yaw) - (pose.z - station.z) * Math.sin(station.yaw);
      assert.ok(forward > 17 && forward <= 25);
      assert.ok(Math.abs(lateral) < 5 && pose.y >= station.y + 1 && pose.y <= station.y + 2.4 + 1e-10);
    }
    assert.deepEqual(orbitPose(station,0,narrow),orbitPose(station,orbitSeconds,narrow));
  }
});
test('tour routing prefers unseen neighboring artwork and never jumps to a distant room', () => {
  const stations = reconcileStations([], Array.from({length:48},(_,i)=>album(String(i).padStart(2,'0'))),yearOf);
  const first = stations[0], nearest = nextTourStation(first,stations,new Set([first.album.id]));
  const following = nextTourStation(first,stations,new Set([first.album.id,nearest.album.id]));
  assert.notEqual(nearest.album.id,first.album.id);
  assert.notEqual(following.album.id,nearest.album.id);
  assert.ok(Math.hypot(following.x-first.x,following.y-first.y,following.z-first.z)<=45);
  assert.equal(nextTourStation(first,[first,stations[47]],new Set()),first);
});
