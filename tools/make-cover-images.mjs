// Makes the two images the site needs from the full-size green cover.
// Put synaxarium-cover-green-3000.png in public/assets/, then run:  npm run cover
//   public/cover-400.png  the Listen card (shown at 96 px, sharp on phones)
//   public/cover-800.png  the large picture beside the saint on the home page (until podcast links exist)
//   public/og.png         the sharing image, 1200 x 1200
import fs from 'node:fs';
import sharp from 'sharp';

const src = 'public/assets/synaxarium-cover-green-3000.png';
if (!fs.existsSync(src)) {
  console.error(`Missing ${src}. Download it from Google Drive (Website Design > assets) and drop it into public/assets/ first.`);
  process.exit(1);
}
await sharp(src).resize(400, 400).png({ compressionLevel: 9 }).toFile('public/cover-400.png');
await sharp(src).resize(800, 800).png({ compressionLevel: 9 }).toFile('public/cover-800.png');
await sharp(src).resize(1200, 1200).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log('wrote public/cover-400.png, public/cover-800.png and public/og.png');
