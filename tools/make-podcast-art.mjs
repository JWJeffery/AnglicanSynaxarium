// Makes public/podcast-cover.jpg (3000 x 3000, RGB, no transparency) from the green cover.
// Apple Podcasts wants a square JPEG or PNG between 1400 and 3000 pixels, with no alpha channel.
import sharp from 'sharp';
import fs from 'node:fs';

const src = 'public/assets/synaxarium-cover-green-3000.png';
if (!fs.existsSync(src)) { console.error(`Missing ${src}`); process.exit(1); }
for (const q of [88, 84, 80, 76, 72]) {
  const buf = await sharp(src).resize(3000, 3000, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (buf.length < 500 * 1024 || q === 72) {
    fs.writeFileSync('public/podcast-cover.jpg', buf);
    console.log(`public/podcast-cover.jpg: 3000 x 3000, quality ${q}, ${(buf.length / 1024).toFixed(0)} KB`);
    break;
  }
}
