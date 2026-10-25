// Official "Listen on ..." badge artwork, supplied by each service, goes in public/badges/ and is picked up by name:
//   spotify.svg   pocket_casts.png   apple_podcasts.svg   youtube.svg   substack.png   (.svg, .png, .webp or .jpg)
// An optional second file ending -dark (for example spotify-dark.svg) is shown instead when the site is in dark mode.
// A service with no file there appears as a plain text button. Badges are shown exactly as supplied: never recolored or resized beyond height.
import fs from 'node:fs';

const EXT = ['svg', 'png', 'webp', 'jpg'];
const find = (name: string): string => {
  for (const e of EXT) if (fs.existsSync(`public/badges/${name}.${e}`)) return `/badges/${name}.${e}`;
  return '';
};
export const badgeFor = (key: string) => ({ light: find(key), dark: find(`${key}-dark`) });
