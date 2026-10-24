// Writes dist/sw.js with Workbox (workbox-build, MIT, Google), the same tool the Universal Office uses.
//
// On the device from the first visit: every page, the day data, the styles, scripts and fonts, so the
// whole Kalendar and every entry read with no connection.
// Never stored by the worker: the recordings (/audio/), the feed, and the large cover files.
// A new release downloads quietly and waits until the open pages close, so a page never mixes versions.
import path from 'node:path';
import { generateSW } from 'workbox-build';

const dist = path.resolve('dist');
const { count, size, warnings } = await generateSW({
  globDirectory: dist,
  swDest: path.join(dist, 'sw.js'),
  globPatterns: ['**/*.{html,js,css,json,woff2,svg,webmanifest}', 'icons/*.png', 'favicon.svg', 'cover-400.png'],
  // The manifest is not stored: Samsung Internet is served none (see public/.htaccess), and a missing file would stop the worker installing there.
  globIgnores: ['manifest.webmanifest', 'feed-source.xml', 'feed.php', 'sw.js', '**/*.map', 'data/day/**/*.map'],
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
  // Print pages are one page read with different ?d=... settings; any query string gets the same page.
  ignoreURLParametersMatching: [/.*/],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  runtimeCaching: [
    { urlPattern: ({ url }) => url.pathname.startsWith('/images/'), handler: 'CacheFirst',
      options: { cacheName: 'syn-images', expiration: { maxEntries: 20 } } },
  ],
});
console.log(`sw.js: ${count} files stored for offline use, ${(size / 1048576).toFixed(1)} MB`, warnings.length ? warnings : '');
