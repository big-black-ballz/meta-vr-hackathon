/**
 * Minimal GLB generator for Hivelord placeholder models. Emits tiny
 * uncompressed GLBs (positions + indices only, no textures) so the real
 * model pipeline, normalization and instancing accessors can be verified
 * before production art exists. Run: node scripts/gen-placeholders.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
mkdirSync(outDir, { recursive: true });

function buildGlb(positions, indices) {
  const posBytes = new Float32Array(positions);
  const idxBytes = new Uint16Array(indices);
  const bin = Buffer.concat([
    Buffer.from(posBytes.buffer, posBytes.byteOffset, posBytes.byteLength),
    Buffer.from(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength),
  ]);
  // Align chunk lengths to 4 bytes (already are for these sizes).
  const json = {
    asset: { version: '2.0', generator: 'hivelord-gen-placeholders' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'placeholder' }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        max: [0.5, 0.5, 0.5],
        min: [-0.5, -0.5, -0.5],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength },
      {
        buffer: 0,
        byteOffset: posBytes.byteLength,
        byteLength: idxBytes.byteLength,
      },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const jsonText = JSON.stringify(json);
  const jsonPad = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = Buffer.concat([
    Buffer.from(jsonText, 'utf8'),
    Buffer.alloc(jsonPad, 0x20),
  ]);
  const total =
    12 + 8 + jsonChunk.length + 8 + bin.length + ((4 - (bin.length % 4)) % 4);
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4; // magic 'glTF'
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonChunk.length, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4; // 'JSON'
  jsonChunk.copy(out, o); o += jsonChunk.length;
  out.writeUInt32LE(bin.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4; // 'BIN'
  bin.copy(out, o);
  return out;
}

// Unit cube centered on the origin, base at y=0 after normalization.
const cube = {
  positions: [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, -0.5, 1, -0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
  ],
  indices: [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ],
};

// Four-sided pyramid (base at y=0, apex y=1).
const pyramid = {
  positions: [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0,
  ],
  indices: [0, 1, 2, 0, 2, 3, 0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0],
};

// Tetrahedron shard.
const shard = {
  positions: [
    0, 0, -0.5, -0.45, 0, 0.35, 0.45, 0, 0.35, 0, 1, 0.05,
  ],
  indices: [0, 1, 2, 0, 3, 1, 1, 3, 2, 2, 3, 0],
};

const files = { bot_01: cube, bot_02: pyramid, bot_03: shard };
for (const [name, geo] of Object.entries(files)) {
  const path = join(outDir, `${name}.glb`);
  writeFileSync(path, buildGlb(geo.positions, geo.indices));
  console.log(`wrote ${path}`);
}
// Corrupt copy for failure-path tests (truncated, invalid length header).
const corrupt = buildGlb(cube.positions, cube.indices).subarray(0, 64);
writeFileSync(join(outDir, 'test_corrupt.glb'), corrupt);
console.log('wrote test_corrupt.glb (truncated)');
