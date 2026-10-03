import { readFile } from 'node:fs/promises';

// Only describe the branch the author selected. Other branches and stable builds
// must not inherit preview claims when this manifest is merged or copied.
export function notesForBuild({ channel, branch }, manifest) {
  if (channel !== 'preview' || !Object.hasOwn(manifest, branch)) return undefined;
  const notes = manifest[branch];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  if (!notes || !text(notes.title) || !text(notes.summary) || !text(notes.tryIt)
    || !Array.isArray(notes.highlights) || !notes.highlights.length || !notes.highlights.every(text)) {
    throw new Error(`Build highlights for ${branch} need a title, summary, highlights and instructions.`);
  }
  return { title: notes.title, summary: notes.summary, highlights: [...notes.highlights], tryIt: notes.tryIt };
}

export async function readBuildNotes(build) {
  try {
    return notesForBuild(build, JSON.parse(await readFile(new URL('../build-highlights.json', import.meta.url), 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function formatBuildNotes(notes) {
  if (!notes) return '';
  return `## ${notes.title}\n\n${notes.summary}\n\n${notes.highlights.map(item => `- ${item}`).join('\n')}\n\n**How to try it:** ${notes.tryIt}\n\n`;
}

export function releaseTitle({ channel, branch, commit, tag, notes }) {
  return channel === 'preview'
    ? `Music Preview · ${branch || commit.slice(0, 7)}${notes ? ` · ${notes.title}` : ''} · ${commit.slice(0, 7)}`
    : `Music ${tag}`;
}
