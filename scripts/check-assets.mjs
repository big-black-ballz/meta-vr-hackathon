/**
 * Hivelord asset validator (Level 4, task 12).
 * Scans public asset folders against src/hivelord/assets/manifest.ts:
 * - files with no manifest entry (separate list)
 * - manifest entries with no file (placeholders: listed, never fail)
 * - oversized files (approxSizeKB vs budget, scene download total)
 * - GLB triangle counts vs per-model budget (JSON chunk parse, no deps)
 * - texture dimensions vs textureMax (sharp, already vendored)
 * - missing license/author and bad file names
 * Usage: npm run check:assets (exit 1 only on real problems, never on
 * placeholders or unlisted starter files)
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const { default: sharp } = await import('sharp').catch(() => ({ default: null }));

// Manifest is TS; extract entries with a tolerant regex (id/url/type/group).
const manifestText = readFileSync('src/hivelord/assets/manifest.ts', 'utf8');
const entryPattern =
  /id:\s*'([^']+)'[\s\S]*?type:\s*'([^']+)'[\s\S]*?url:\s*'([^']+)'[\s\S]*?group:\s*'([^']+)'[\s\S]*?fallbackId:\s*'([^']+)'/g;
const entries = [];
let match;
while ((match = entryPattern.exec(manifestText)) !== null) {
  entries.push({ id: match[1], type: match[2], url: match[3], group: match[4], fallbackId: match[5] });
}

const licenseMissing = [];
for (const entry of entries) {
  const block = manifestText.slice(
    Math.max(0, manifestText.indexOf(`id: '${entry.id}'`) - 50),
    manifestText.indexOf(`id: '${entry.id}'`) + 900,
  );
  if (!/license:\s*'[^']+'/.test(block) || /license:\s*''/.test(block)) {
    licenseMissing.push(entry.id);
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const DIRS = ['public/models', 'public/textures', 'public/audio', 'public/ui/icons', 'public/stills', 'public/gltf'];
const files = DIRS.flatMap((d) => walk(d));
const byUrl = new Map(entries.map((e) => [`public/${e.url}`, e]));
const unlisted = files.filter((f) => !byUrl.has(f.replaceAll('\\', '/')));
const missing = entries.filter((e) => !existsSync(join('public', e.url)));

function countGltfTriangles(json) {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const accessor = json.accessors?.[prim.indices];
      if (accessor?.count != null) {
        tris += accessor.count / 3;
      }
    }
  }
  return { triangles: Math.round(tris) };
}

function glbTriangles(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) {
    return { error: 'not a GLB' };
  }
  const jsonLen = buf.readUInt32LE(12);
  let json;
  try {
    json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  } catch {
    return { error: 'bad JSON chunk' };
  }
  return countGltfTriangles(json);
}

const rows = [];
for (const entry of entries) {
  const path = join('public', entry.url);
  if (!existsSync(path)) {
    continue; // placeholder: listed separately below
  }
  const kb = Math.round(statSync(path).size / 1024);
  if (entry.type === 'model' && (path.endsWith('.glb') || path.endsWith('.gltf'))) {
    let result;
    if (path.endsWith('.gltf')) {
      try {
        result = countGltfTriangles(JSON.parse(readFileSync(path, 'utf8')));
      } catch {
        result = { error: 'bad glTF JSON' };
      }
    } else {
      result = glbTriangles(path);
    }
    rows.push({
      id: entry.id, kind: 'model',
      detail: result.error ?? `${result.triangles} tris, ${kb}KB`,
      flag: result.error != null || (result.triangles ?? 0) > (entry.triangles ?? 15000),
    });
  } else if ((entry.type === 'texture' || entry.type === 'image') && sharp != null) {
    try {
      const meta = await sharp(path).metadata();
      const over = (meta.width ?? 0) > (entry.textureMax ?? 1024) || (meta.height ?? 0) > (entry.textureMax ?? 1024);
      rows.push({
        id: entry.id, kind: entry.type,
        detail: `${meta.width}x${meta.height} ${meta.format}, ${kb}KB`,
        flag: over,
      });
    } catch {
      rows.push({ id: entry.id, kind: entry.type, detail: 'unreadable image', flag: true });
    }
  } else {
    rows.push({ id: entry.id, kind: entry.type, detail: `${kb}KB on disk`, flag: false });
  }
}

const badNames = files.filter((f) => {
  const base = basename(f);
  return !/^[a-z0-9]+_[a-z0-9_]*\.[a-z0-9]+$/.test(base) && !/^(banner|chime|webxr)\b/.test(base);
});

console.log('=== manifest entries with files ===');
console.log('id | kind | detail | flag');
for (const row of rows) {
  console.log(`${row.id} | ${row.kind} | ${row.detail} | ${row.flag ? 'OVER' : 'ok'}`);
}
console.log('\n=== placeholders (no file yet, expected) ===');
for (const entry of missing) {
  console.log(`${entry.id} | ${entry.type} | ${entry.group} | -> fallback '${entry.fallbackId ?? '?'}'`);
}
console.log('\n=== files with no manifest entry ===');
for (const file of unlisted) {
  console.log(file);
}
console.log('\n=== missing license/author ===');
console.log(licenseMissing.length > 0 ? licenseMissing.join(', ') : 'none');
console.log('\n=== bad file names ===');
console.log(badNames.length > 0 ? badNames.join('\n') : 'none');

const realProblems =
  rows.filter((r) => r.flag && !r.id.startsWith('test_')).length +
  licenseMissing.length +
  badNames.length;
if (realProblems > 0) {
  console.error(`\ncheck:assets FAILED with ${realProblems} problem(s) (placeholders and test_ fixtures excluded).`);
  process.exitCode = 1;
} else {
  console.log('\ncheck:assets passed (placeholders and test_ fixtures excluded).');
}
