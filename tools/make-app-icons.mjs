// Makes the home-screen icons from the compass rose on the green cover.
// Writes public/icons/: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png.
// "Maskable" icons keep the rose inside the middle 60% so Android can round or crop the corners freely.
import sharp from 'sharp';
import fs from 'node:fs';

const src = 'public/assets/synaxarium-cover-green-3000.png';
if (!fs.existsSync(src)) { console.error(`Missing ${src}`); process.exit(1); }
const GREEN = { r: 31, g: 74, b: 51 }; // #1F4A33, the cover and favicon green
// The compass rose sits in the lower right of the 3000 px cover.
const rose = await sharp(src).extract({ left: 2258, top: 2278, width: 594, height: 594 }).toBuffer();

async function icon(file, size, fill) {
  const inner = Math.round(size * fill);
  const r = await sharp(rose).resize(inner, inner).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: GREEN } })
    .composite([{ input: r, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png().toFile(`public/icons/${file}`);
  console.log(`public/icons/${file} ${size} x ${size}`);
}
fs.mkdirSync('public/icons', { recursive: true });
await icon('icon-192.png', 192, 0.72);
await icon('icon-512.png', 512, 0.72);
await icon('icon-maskable-512.png', 512, 0.56);
await icon('apple-touch-icon.png', 180, 0.72);
