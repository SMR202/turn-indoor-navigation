import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const skipped = new Set([
  '.git',
  'node_modules',
  '.expo',
  'dist',
  'work',
  'coverage',
]);
async function* documents(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* documents(path);
    else if (entry.name.endsWith('.md')) yield path;
  }
}
let count = 0;
const failures = [];
for await (const file of documents('.')) {
  const content = (await readFile(file, 'utf8')).replace(/```[\s\S]*?```/g, '');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    count++;
    try {
      await stat(resolve(dirname(file), decodeURIComponent(target)));
    } catch {
      failures.push(`${file}: ${target}`);
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Validated ${count} local Markdown file/directory targets (not anchors or external URLs).`,
  );
