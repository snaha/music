// Synthetic music only; contains no real account data or credentials.
export const bootstrap = () => {
    const w = window;
    localStorage.clear();
    localStorage.setItem('motion', '0');
    const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#27465b"/><circle cx="200" cy="200" r="120" fill="#d4a35b"/><circle cx="200" cy="200" r="45" fill="#27465b"/></svg>')}`;
    const albums = Array.from({ length: 240 }, (_, i) => ({ id: `spotify:album:${i}`, rawId: `${i}`, source: 'spotify', kind: 'album', title: i === 0 ? 'A very long album title with multiple editions and a complete collection of recordings' : `Album ${String(i).padStart(3, '0')}`, sub: i % 2 ? 'David Bowie' : 'Various Artists', cover, count: 2, available: true, year: 1970 + i % 54, genres: [i % 2 ? 'Rock' : 'Jazz'], externalUrl: 'https://open.spotify.com/album/audit' }));
    albums[3] = { ...albums[3], available: false, count: 0, incomplete: true };
    const tracks = [1, 2].map(i => ({ id: `spotify:track:${i}`, rawId: `${i}`, source: 'spotify', title: `Included song ${i} with a longer title`, artist: 'Various Artists', album: albums[0].title, albumId: albums[0].id, albumInfo: albums[0], cover, duration: 180, disc: i, track: 1, uri: `spotify:track:audit${i}`, available: true, origins: [{ id: 'liked', title: 'Liked Songs', kind: 'playlist' }] }));
    const catalogTracks = [...tracks.map(track => ({ ...track, albumId: albums[0].id, albumInfo: albums[0] })), ...albums.slice(1).filter(album => album.available).flatMap(album => [1, 2].map(n => ({
        id: `spotify:track:catalog${album.rawId}${n}`, rawId: `catalog${album.rawId}${n}`, source: 'spotify', title: `Catalog song ${album.rawId} take ${n}`,
        artist: album.sub, album: album.title, albumId: album.id, albumInfo: album, cover, duration: 180, track: n, disc: 1,
        uri: `spotify:track:catalog${album.rawId}${n}`, available: true,
    })))];
    const collections = [{ ...albums[0], id: 'spotify:liked', kind: 'playlist', title: 'Liked Songs', count: 2 }, { ...albums[1], id: 'spotify:playlist:restricted', rawId: 'restricted', kind: 'playlist', title: 'Spotify-made mix', sub: 'Spotify playlist', count: 25, available: false, externalUrl: 'https://open.spotify.com/playlist/audit' }];
    // Distinct synthetic artwork makes playlist composition and original-cover fidelity visible.
    const galleryAlbums = ['Afterimage', 'Static gardens', 'Glass horizon', 'Blue hour', 'Heat map', 'Distant rooms'].map((title, i) => {
        const palettes = [['#ee694b','#182b42','#f7d9ad'],['#c1d083','#254a42','#f9ecc4'],['#77abc3','#1b264b','#f1bd8d'],['#342f6c','#ed817f','#c6def4'],['#ca443b','#efb350','#452649'],['#decbb0','#283845','#75a494']];
        const [base, ink, paper] = palettes[i];
        const image = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${base}"/><path d="M${40+i*12} 110h310v310H${40+i*12}z" fill="${ink}"/><path d="M0 ${190+i*22}L512 75v135L0 ${350+i*18}z" fill="${paper}"/><path d="M300 0v512" stroke="${base}" stroke-width="48"/><text x="30" y="56" fill="${ink}" font-size="29" font-family="sans-serif">${title.toUpperCase()}</text><text x="30" y="484" fill="${paper}" font-size="15" font-family="sans-serif">SYNTHETIC ARTWORK STUDY ${i+1}</text></svg>`;
        return {...albums[i], id:`spotify:album:artwork${i}`, rawId:`artwork${i}`, title, sub:'Audit Ensemble', year:1980+i, available:true, cover:`data:image/svg+xml,${encodeURIComponent(image)}`};
    });
    const galleryTracks = galleryAlbums.flatMap(album => [1,2].map(n => ({...tracks[0], id:`spotify:track:${album.rawId}-${n}`, rawId:`${album.rawId}-${n}`, title:`${album.title} ${n}`, album:album.title, albumId:album.id, albumInfo:album, cover:album.cover, uri:`spotify:track:${album.rawId}-${n}`})));
    catalogTracks.push(...galleryTracks);
    collections.push({...galleryAlbums[0], id:'spotify:playlist:artworks', rawId:'artworks', kind:'playlist', title:'Night flights', sub:'Artwork audit playlist', count:galleryTracks.length});
    const status = { availability: 'ready', connected: true, account: 'Test account', clientId: '', collections, albums, indexedTracks: 480, indexing: false, indexError: '', inaccessiblePlaylists: 1, updatedAt: 0, syncing: false, progress: '', error: '', retryAt: 0, quotaBlocked: false, deviceId: 'audit', deviceName: 'Spotify Desktop', sameMac: true };
    let callback;
    let playback = null;
    // Match the startup/profile bridge from the Spotify base without touching a real profile.
    const desktopStatus = { phase: 'ready', error: '', onboarding: false, url: location.origin, username: 'audit', password: 'test-only', frame: true,
        build: { version: 'audit', channel: 'audit', commit: '', branch: '', builtAt: '', runUrl: '' },
        profile: { name: 'audit', label: 'Synthetic audit', directory: '', existing: true, portable: false },
        musicFolder: '', musicFolders: [], defaultMusicFolder: '', defaultMusicFolderAvailable: false, source: 'empty', canCopy: false };
    let desktopCallback;
    w.__auditDesktopStatus = changes => { Object.assign(desktopStatus, changes); desktopCallback?.({ ...desktopStatus }); };
    w.desktop = { status: async () => ({ ...desktopStatus }), onChange: fn => { desktopCallback = fn; return () => { desktopCallback = undefined; }; }, profiles: async () => [] };
    const historyScope = crypto.randomUUID();
    const historyCall = async (method, args) => {
        const response = await fetch(`/audit-history/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, scope: `${args.scope}:${historyScope}` }) });
        const reply = await response.json();
        if (!response.ok) throw new Error(reply.error);
        return reply.value;
    };
    w.musicHistory = { stats: args => historyCall('stats', args), write: args => historyCall('write', args), list: args => historyCall('list', args), clear: scope => historyCall('clear', { scope }) };
    w.__auditCommands = [];
    w.__auditRefresh = () => callback?.({ ...status, albums: albums.map(a => ({ ...a, count: 3 })) });
    w.__auditSpotifyStatus = (changes) => { Object.assign(status, changes); callback?.({ ...status }); };
    w.spotify = {
        status: async () => status, checkAvailability: async () => status, onChange: (fn) => { callback = fn; return () => { callback = undefined; }; },
        playback: async () => playback, transition: async () => { },
        command: async (...args) => {
            w.__auditCommands.push(args);
            const [action, value] = args;
            if (action === 'play') playback = { deviceId: 'audit', playing: true, progress: 0, track: catalogTracks.find(t => t.uri === value) || tracks[0], type: 'track', volume: 100, supportsVolume: true, shuffle: false, repeat: 'off', disallows: {} };
            if (playback && action === 'pause') playback.playing = false;
            if (playback && action === 'resume') playback.playing = true;
            if (playback && action === 'seek') playback.progress = value;
            if (playback && action === 'volume') playback.volume = value;
        },
        devices: async () => [{ id: 'audit', name: 'Spotify Desktop', type: 'Computer', is_restricted: false, is_active: true }],
        selectDevice: async () => status, refresh: async () => status,
        disconnect: async () => { w.__auditCommands.push(['disconnect']); w.__auditSpotifyStatus({ connected: false, availability: 'disconnected' }); return { ...status }; },
        search: async (query, offset = 0) => {
            const words = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
            const matches = value => words.every(word => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(word));
            const found = catalogTracks.filter(track => matches(`${track.title} ${track.artist} ${track.album}`));
            const related = new Set(found.map(track => track.albumId));
            const names = [...new Set(albums.map(album => album.sub))].filter(name => matches(name));
            return { collections: [...albums, ...collections].filter(tile => matches(`${tile.title} ${tile.sub} ${tile.year} ${tile.genres?.join(' ')}`) || related.has(tile.id)),
                artists: names.map(name => ({ ...albums.find(album => album.sub === name), id: `spotify:artist:${name}`, rawId: name, kind: 'artist', title: name, sub: 'Artist', count: albums.filter(album => album.sub === name).length })),
                tracks: found.slice(offset, offset + 50).map(track => ({ ...track, playbackOrigin: track.albumInfo })), next: offset + 50 < found.length ? offset + 50 : null };
        },
        albumTracks: async (id = albums[0].id, offset = 0) => { const found = catalogTracks.filter(track => track.albumId === id); return { tracks: found.slice(offset, offset + 50), next: offset + 50 < found.length ? offset + 50 : null }; }, tracks: async (id, offset = 0) => { const entries = id === 'spotify:playlist:artworks' ? galleryTracks : tracks; return {tracks:entries.slice(offset, offset + 4), next:offset + 4 < entries.length ? offset + 4 : null}; }, external: async url => { w.__auditExternal = url; },
    };
};
