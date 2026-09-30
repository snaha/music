export const spotifyId = (kind, id) => `spotify:${kind}:${id}`;

export function musicTrack(item, album) {
  if (!item || item.type !== 'track' || item.is_local || !item.id) return null;
  const a = item.album ?? album;
  return {
    id: spotifyId('track', item.id), rawId: item.id, source: 'spotify',
    uri: item.uri ?? spotifyId('track', item.id), title: item.name,
    artist: (item.artists ?? []).map((x) => x.name).join(', '),
    album: a?.name ?? '', albumId: a?.id ? spotifyId('album', a.id) : undefined,
    cover: a?.images?.[0]?.url ?? '', duration: (item.duration_ms ?? 0) / 1000,
    track: item.track_number, disc: item.disc_number ?? 1,
    albumInfo: a?.id ? albumTile(a) : undefined, externalUrl: `https://open.spotify.com/track/${item.id}`,
    available: item.is_playable !== false && !item.restrictions?.reason,
  };
}

export function albumTile(a, addedAt) {
  return {
    id: spotifyId('album', a.id), rawId: a.id, source: 'spotify', kind: 'album',
    title: a.name, sub: (a.artists ?? []).map((x) => x.name).join(', '),
    cover: a.images?.[0]?.url ?? '', count: a.total_tracks ?? 0, addedAt,
    externalUrl: `https://open.spotify.com/album/${a.id}`, available: true,
  };
}

export function playlistTile(p, account) {
  const accessible = p.owner?.id === account || p.collaborative === true;
  return {
    id: spotifyId('playlist', p.id), rawId: p.id, source: 'spotify', kind: 'playlist',
    title: p.name, sub: accessible ? 'Spotify playlist' : 'Contents unavailable through Spotify',
    cover: p.images?.[0]?.url ?? '', count: p.items?.total ?? p.tracks?.total ?? 0,
    externalUrl: `https://open.spotify.com/playlist/${p.id}`, available: accessible,
    snapshot: p.snapshot_id,
  };
}
