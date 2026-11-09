/**
 * Repeatable UI color check (Obsidian Gold reskin).
 *
 * Searches the allowlist scope for hard-coded colors: hex literals,
 * rgb()/rgba() functional notation, 0x numeric colors, `new Color(` calls
 * and fillStyle/strokeStyle string-literal assignments. Any match outside
 * the allowlist exclusions fails the check (exit 1) with a file:line list.
 *
 * Usage: npm run check:ui-colors
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const allowlist = JSON.parse(
  readFileSync(join(root, 'scripts', 'ui-color-allowlist.json'), 'utf8'),
);

const PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\brgba?\(\s*[\d.]/g,
  /0x[0-9a-fA-F]+/g,
  /new\s+Color\s*\(/g,
  /(fillStyle|strokeStyle)\s*=\s*['"`]/g,
];

function toPosix(p) {
  return p.split('\\').join('/');
}

function collectFiles(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(ts|tsx|js|css|uikitml)$/.test(name)) {
      out.push(full);
    }
  }
}

const excludedNorm = new Set(
  allowlist.excludedFiles.map((entry) => entry.file),
);

let findings = 0;
for (const scope of allowlist.scope) {
  const abs = join(root, scope);
  let files = [];
  try {
    if (statSync(abs).isDirectory()) {
      collectFiles(abs, files);
    } else {
      files = [abs];
    }
  } catch {
    console.error(`scope missing: ${scope}`);
    process.exitCode = 1;
    continue;
  }
  for (const file of files) {
    const rel = toPosix(file.slice(root.length + 1));
    if (excludedNorm.has(rel)) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(lines[i]);
        if (match != null) {
          console.log(`${rel}:${i + 1}: ${match[0]} :: ${lines[i].trim()}`);
          findings++;
          break;
        }
      }
    }
  }
}

if (findings > 0) {
  console.error(`\nui-color check FAILED: ${findings} hard-coded color(s).`);
  process.exitCode = 1;
} else {
  console.log('ui-color check passed: no hard-coded colors outside theme.ts.');
}
