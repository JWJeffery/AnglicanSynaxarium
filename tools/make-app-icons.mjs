// Makes the home-screen icons from the cover art (the title and the compass rose together).
// Writes public/icons/: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png.
// "Maskable" icons shrink the cover to 66% on matching green so Android can round or crop the
// corners freely without cutting into the title or the rose.
import sharp from 'sharp';
import fs from 'node:fs';

const src = 'public/assets/synaxarium-cover-green-3000.png';
if (!fs.existsSync(src)) { console.error(`Missing ${src}`); process.exit(1); }
const GREEN = { r: 31, g: 74, b: 51 }; // #1F4A33, the cover green
fs.mkdirSync('public/icons', { recursive: true });

async function full(file, size) {
  await sharp(src).resize(size, size).png().toFile(`public/icons/${file}`);
  console.log(`public/icons/${file} ${size} x ${size}`);
}
async function padded(file, size, fill) {
  const inner = Math.round(size * fill);
  const art = await sharp(src).resize(inner, inner).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: GREEN } })
    .composite([{ input: art, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png().toFile(`public/icons/${file}`);
  console.log(`public/icons/${file} ${size} x ${size} (cover at ${Math.round(fill * 100)}%)`);
}
await full('icon-192.png', 192);
await full('icon-512.png', 512);
await padded('icon-maskable-512.png', 512, 0.66);
await full('apple-touch-icon.png', 180);
