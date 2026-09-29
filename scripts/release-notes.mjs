// Writes the description for a GitHub release: docs/release-notes/about.md with the version filled in and
// docs/release-notes/<version>.md (what is new) in its place. The release build runs it; to see it:
//   node scripts/release-notes.mjs [version]      (the version in package.json when left out)
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const version = process.argv[2] ?? JSON.parse(read('package.json')).version;
const whatsNew = `docs/release-notes/${version}.md`;
if (!existsSync(new URL(whatsNew, root))) {
  console.error(`Missing ${whatsNew}: every release needs a note of what is new in it.`);
  process.exit(1);
}

const about = read('docs/release-notes/about.md')
  // The comment at the top is for whoever edits the file, not for the release page.
  .replace(/^<!--[\s\S]*?-->\s*/, '');
process.stdout.write(about.replaceAll('{{WHATS_NEW}}', read(whatsNew).trim()).replaceAll('{{VERSION}}', version));
