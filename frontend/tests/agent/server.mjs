import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { bootstrap } from './fixture.mjs';

const root = path.resolve(import.meta.dirname, '../../dist');
const port = Number(process.env.MUSIC_AUDIT_PORT || 4178);
const bodies = {
  ping: {}, getUser: { user: { username: 'audit', adminRole: true } },
  getAlbumList2: { albumList2: { album: [] } }, getPlaylists: { playlists: { playlist: [] } },
  getScanStatus: { scanStatus: { scanning: false, count: 0 } },
};
const injection = `<script>(${bootstrap.toString()})();</script>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/rest/')) {
    const method = url.pathname.split('/').pop().replace('.view', '');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...bodies[method] } }));
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
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
