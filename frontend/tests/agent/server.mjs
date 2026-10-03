import http from 'node:http';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MusicDatabase } from '../../../desktop/music-database.js';
const historyDirectory = await mkdtemp(path.join(os.tmpdir(), 'music-audit-'));
const history = new MusicDatabase(path.join(historyDirectory, 'music.sqlite'));
import { bootstrap } from './fixture.mjs';

const root = path.resolve(import.meta.dirname, '../../dist');
const port = Number(process.env.MUSIC_AUDIT_PORT || 4178);
const localAlbums = [{ id: 'local-audit-album', name: 'Déjà vu', artist: 'Local Ensemble', songCount: 2, year: 1997, genre: 'Jazz', coverArt: 'audit-cover' }];
const localSongs = [1, 2].map(n => ({ id: `local-audit-song-${n}`, title: n === 1 ? 'Midnight lantern' : 'Déjà vu reprise', artist: 'Local Ensemble', album: 'Déjà vu', albumId: 'local-audit-album', duration: 180, track: n, genre: 'Jazz', coverArt: 'audit-cover' }));
const localArtists = [{ id: 'local-audit-artist', name: 'Local Ensemble', albumCount: 1, coverArt: 'audit-cover' }];
const localPlaylists = [{ id: 'local-audit-playlist', name: 'Quiet evenings', songCount: 2, coverArt: 'audit-cover' }];
const bodies = {
  ping: {}, getUser: { user: { username: 'audit', adminRole: true } },
  getAlbumList2: { albumList2: { album: localAlbums } }, getPlaylists: { playlists: { playlist: localPlaylists } },
  getAlbum: { album: { ...localAlbums[0], song: localSongs } }, getArtist: { artist: { ...localArtists[0], album: localAlbums } }, getPlaylist: { playlist: { ...localPlaylists[0], entry: localSongs } },
  getScanStatus: { scanStatus: { scanning: false, count: 0 } },
};
const injection = `<script>(${bootstrap.toString()})();</script>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/audit-history/') && req.method === 'POST') {
    const method = url.pathname.split('/').pop();
    res.setHeader('Content-Type', 'application/json');
    try {
      if (!['write', 'list', 'clear', 'stats'].includes(method)) throw new Error('Unknown history operation');
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const value = await history.call(method, JSON.parse(Buffer.concat(chunks).toString()));
      res.end(JSON.stringify({ value }));
    } catch (error) { res.writeHead(400); res.end(JSON.stringify({ error: error.message })); }
    return;
  }
  if (url.pathname.startsWith('/rest/')) {
    const method = url.pathname.split('/').pop().replace('.view', '');
    if (method === 'getCoverArt') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#4b3c57"/><circle cx="200" cy="200" r="140" fill="#b1baa2"/></svg>'); return; }
    const words = (url.searchParams.get('query') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const match = item => words.every(word => Object.values(item).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(word));
    const page = (items, key) => { const offset = Number(url.searchParams.get(`${key}Offset`) || 0); return items.filter(match).slice(offset, offset + Number(url.searchParams.get(`${key}Count`) ?? 50)); };
    const body = method === 'search3' ? { searchResult3: { album: page(localAlbums, 'album'), song: page(localSongs, 'song'), artist: page(localArtists, 'artist') } } : bodies[method];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } }));
    return;
  }
  const file = path.resolve(root, `.${url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    res.end(file.endsWith('index.html') ? data.toString().replace('<head>', `<head>${injection}`) : data);
  } catch { res.writeHead(404).end('Not found; build the frontend first.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Music regression fixture: http://127.0.0.1:${port} (synthetic library, mocked playback)`));
const stop = () => server.close(async () => { await history.close(); await rm(historyDirectory, { recursive: true, force: true }); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
