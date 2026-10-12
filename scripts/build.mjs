import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Static deployment: validate relative imports before assembling the Pages artifact.
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const entries = ['index.html', 'app.js', 'styles.css', 'shared', 'games'];
let checked = 0;
async function validate(path) {
  if ((await stat(path)).isDirectory()) {
    for (const entry of await readdir(path)) await validate(resolve(path, entry));
    return;
  }
  if (!/\.(?:js|mjs|html)$/.test(path)) return;
  const source = await readFile(path, 'utf8');
  const pattern = path.endsWith('.html')
    ? /(?:src|href)=["']([^"']+)["']/g
    : /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;
  for (const [, specifier] of source.matchAll(pattern)) {
    if (/^(?:https?:|data:|blob:|#)/.test(specifier)) continue;
    if (!path.endsWith('.html') && !specifier.startsWith('.'))
      throw new Error(`Unresolved module specifier ${specifier} in ${path}`);
    const target = resolve(dirname(path), specifier.split(/[?#]/)[0]);
    if (!target.startsWith(root + '/')) throw new Error(`Asset escapes site root: ${target}`);
    await stat(target); // Missing dependencies must fail the build.
    checked++;
  }
}
for (const entry of entries) await validate(resolve(root, entry));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of entries) await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
await writeFile(resolve(output, '.nojekyll'), '');
console.log(`Static Pages build: ${checked} local asset references verified; output dist/`);
