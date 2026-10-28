import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// The icon drawings are intentional designs. Change these hashes only when
// the corresponding visual design is deliberately changed and reviewed.
const designs = [
  ['index.html', '817ba669718baeb2cfadac84d156b5414a2347ed981d7e4e665eb4d72fac0b60'],
  ['diorama.html', '7434625a171d1896a6eb451be55ba7a26f0013c06c14573f9b3f21b6aea524a6'],
];
for (const [file, expected] of designs) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const icon = html.match(/<div class="goggles[^>]*" aria-hidden="true">([\s\S]*?)(?=<div class="label")/);
  assert.ok(icon, `${file}: loading icon container missing`);
  const drawings = [...icon[1].matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0]);
  assert.equal(drawings.length, 3, `${file}: expected three hand-drawn SVG frames`);
  const digest = createHash('sha256').update(drawings.join('\n')).digest('hex');
  assert.equal(digest, expected, `${file}: loading icon changed; review the new design before updating its hash`);
  console.log(`PASS ${file}: loading icon SVG frames match the saved design`);
}
