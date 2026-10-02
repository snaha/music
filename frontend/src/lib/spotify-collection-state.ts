import type { Collection } from './music';

// Collection access is separate from the connection/output needed for playback.
export function spotifyCollectionState(tile: Collection, indexing = false) {
  if (tile.source !== 'spotify' || tile.available) return null;
  if (tile.kind === 'playlist') return {
    label: 'Spotify only',
    detail: 'Spotify limits this playlist’s song list to its owner and collaborators. Music can show its cover, but cannot load its songs or add them to your queue.',
    help: 'Open it in Spotify to listen. To use these songs in Music, save them to Liked Songs or a playlist you own, then refresh your Spotify library in Settings.',
    refresh: false,
  };
  if (tile.indexing && indexing) return {
    label: 'Loading tracks',
    detail: 'Music is loading this album’s songs in the background. They will become available as the library updates.',
    help: 'You can keep browsing or open the album in Spotify while you wait.',
    refresh: false,
  };
  if (tile.count > 0) return {
    label: 'No playable tracks',
    detail: 'Spotify marks the included songs as unavailable for this account. The cover can remain in your library even when those songs cannot be played here.',
    help: 'Open the album in Spotify to check its availability or look for another edition.',
    refresh: false,
  };
  return {
    label: 'Tracks not loaded',
    detail: 'Music has the album’s cover, but has not loaded any playable songs for it yet.',
    help: 'Check your Spotify connection and refresh the library to try again. You can also open the album in Spotify.',
    refresh: true,
  };
}
