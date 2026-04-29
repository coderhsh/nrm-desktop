const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcData = Buffer.concat([typeB, data]);
  const crcV = Buffer.alloc(4);
  crcV.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, typeB, data, crcV]);
}

function createPNG(width, height, r, g, b) {
  // RGBA (color type 6) instead of RGB (color type 2)
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      const cx = width / 2, cy = height / 2;
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      const t = Math.min(dist / maxDist, 1);
      rawData[offset] = Math.round(r * (1 - t * 0.3));
      rawData[offset + 1] = Math.round(g * (1 - t * 0.3));
      rawData[offset + 2] = Math.round(b * (1 - t * 0.3));
      rawData[offset + 3] = 255; // alpha
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // color type 6 = RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function createICO(pngBuffer) {
  // Number of icons (just 1 for simplicity)
  const count = 1;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: ICO
  header.writeUInt16LE(count, 4); // count

  // Directory entry
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);  // width
  entry.writeUInt8(32, 1);  // height
  entry.writeUInt8(0, 2);   // palette
  entry.writeUInt8(0, 3);   // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

  return Buffer.concat([header, entry, pngBuffer]);
}

const iconDir = path.join(
  "D:",
  "work_space",
  "github",
  "nrm-desktop",
  "src-tauri",
  "icons"
);

const sizes = [
  { name: "32x32.png", w: 32, h: 32 },
  { name: "128x128.png", w: 128, h: 128 },
  { name: "128x128@2x.png", w: 256, h: 256 },
];

for (const s of sizes) {
  const png = createPNG(s.w, s.h, 79, 110, 247);
  fs.writeFileSync(path.join(iconDir, s.name), png);
  console.log("Created " + s.name + " (" + png.length + " bytes)");
}

// icon.png for tray (32x32)
fs.writeFileSync(path.join(iconDir, "icon.png"), createPNG(32, 32, 79, 110, 247));
console.log("Created icon.png");

// Proper ICO file for Windows
const ico32 = createPNG(32, 32, 79, 110, 247);
const icoBuffer = createICO(ico32);
fs.writeFileSync(path.join(iconDir, "icon.ico"), icoBuffer);
console.log("Created icon.ico (proper ICO format, " + icoBuffer.length + " bytes)");

// Simple ICNS-like placeholder (just a PNG renamed for now, macOS can handle PNG for icons in some cases)
// For a proper ICNS we'd need a much more complex format
fs.writeFileSync(path.join(iconDir, "icon.icns"), createPNG(128, 128, 79, 110, 247));
console.log("Created icon.icns (PNG placeholder)");
