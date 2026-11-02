#!/usr/bin/env node
/**
 * Generates a 72x72 PNG badge with a white triangle on transparent background.
 * Pure Node.js implementation — no external dependencies.
 *
 * Triangle: equilateral, pointing up, centered with 8px padding.
 * Points: top (36, 8), bottom-left (8, 64), bottom-right (64, 64)
 */

const fs = require("fs");
const zlib = require("zlib");

// Image dimensions
const WIDTH = 72;
const HEIGHT = 72;

// Triangle vertices (x, y)
const TRI = [
  { x: 36, y: 8 },   // top
  { x: 8, y: 64 },   // bottom-left
  { x: 64, y: 64 },  // bottom-right
];

/**
 * Check if a point is inside the triangle using barycentric coordinates.
 */
function pointInTriangle(px, py, a, b, c) {
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = px - a.x;
  const v2y = py - a.y;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= 0 && v >= 0 && u + v <= 1;
}

/**
 * Generate raw RGBA pixel data (Buffer).
 */
function generatePixels() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const [a, b, c] = TRI;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      if (pointInTriangle(x + 0.5, y + 0.5, a, b, c)) {
        // White with full opacity
        pixels[idx] = 255;     // R
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = 255; // A
      } else {
        // Transparent
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }
  return pixels;
}

/**
 * PNG chunk: [length (4 bytes)][type (4 bytes)][data][crc32 (4 bytes)]
 */
function writeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Simple CRC32 implementation (polynomial 0xEDB88320).
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create PNG file from raw RGBA pixels.
 */
function createPNG(pixels) {
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT chunk: compress scanlines with filter type 0 (none)
  const scanlineSize = WIDTH * 4 + 1; // +1 for filter byte
  const rawData = Buffer.alloc(HEIGHT * scanlineSize);
  for (let y = 0; y < HEIGHT; y++) {
    rawData[y * scanlineSize] = 0; // filter type 0
    pixels.copy(rawData, y * scanlineSize + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  const compressed = zlib.deflateSync(rawData);

  // IEND chunk
  const iend = Buffer.alloc(0);

  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    writeChunk("IHDR", ihdr),
    writeChunk("IDAT", compressed),
    writeChunk("IEND", iend),
  ]);
}

// Generate and write
const pixels = generatePixels();
const png = createPNG(pixels);
fs.writeFileSync("/Users/akinduariyaratna/ApexMissions/public/badge-72.png", png);
console.log("Generated public/badge-72.png");