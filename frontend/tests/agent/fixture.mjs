// Synthetic music only; contains no real account data or credentials.
export const bootstrap = () => {
    const w = window;
    localStorage.clear();
    localStorage.setItem('motion', '0');
    const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#27465b"/><circle cx="200" cy="200" r="120" fill="#d4a35b"/><circle cx="200" cy="200" r="45" fill="#27465b"/></svg>')}`;
    const albums = Array.from({ length: 240 }, (_, i) => ({ id: `spotify:album:${i}`, rawId: `${i}`, source: 'spotify', kind: 'album', title: i === 0 ? 'A very long album title with multiple editions and a complete collection of recordings' : `Album ${String(i).padStart(3, '0')}`, sub: i % 2 ? 'David Bowie' : 'Various Artists', cover, count: 2, available: true, externalUrl: 'https://open.spotify.com/album/audit' }));
    const tracks = [1, 2].map(i => ({ id: `spotify:track:${i}`, rawId: `${i}`, source: 'spotify', title: `Included song ${i} with a longer title`, artist: 'Various Artists', album: albums[0].title, cover, duration: 180, disc: i, track: 1, uri: `spotify:track:audit${i}`, available: true, origins: [{ id: 'liked', title: 'Liked Songs', kind: 'playlist' }] }));
    const collections = [{ ...albums[0], id: 'spotify:liked', kind: 'playlist', title: 'Liked Songs', count: 2 }];
    const status = { availability: 'ready', connected: true, account: 'Test account', clientId: '', collections, albums, indexedTracks: 480, indexing: false, indexError: '', inaccessiblePlaylists: 1, updatedAt: 0, syncing: false, progress: '', error: '', retryAt: 0, quotaBlocked: false, deviceId: 'audit', deviceName: 'Spotify Desktop', sameMac: true };
    let callback;
    let playback = null;
    w.desktop = { url: location.origin, username: 'audit', password: 'test-only', frame: true };
    w.__auditCommands = [];
    w.__auditRefresh = () => callback?.({ ...status, albums: albums.map(a => ({ ...a, count: 3 })) });
    w.spotify = {
        status: async () => status, checkAvailability: async () => status, onChange: (fn) => { callback = fn; return () => { callback = undefined; }; },
        playback: async () => playback, transition: async () => { },
        command: async (...args) => {
            w.__auditCommands.push(args);
            const [action, value] = args;
            if (action === 'play') playback = { deviceId: 'audit', playing: true, progress: 0, track: tracks.find(t => t.uri === value) || tracks[0], type: 'track', shuffle: false, repeat: 'off', disallows: {} };
            if (playback && action === 'pause') playback.playing = false;
            if (playback && action === 'resume') playback.playing = true;
            if (playback && action === 'seek') playback.progress = value;
        },
        devices: async () => [{ id: 'audit', name: 'Spotify Desktop', type: 'Computer', is_restricted: false, is_active: true }],
        selectDevice: async () => status, refresh: async () => status,
        albumTracks: async () => ({ tracks, next: null }), tracks: async () => ({ tracks, next: null }), external: async () => { },
    };
};
