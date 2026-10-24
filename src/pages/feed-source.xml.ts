// The full podcast feed, every episode with its release time. Visitors never read this file:
// public/feed.php serves it as /feed.xml with unreleased episodes removed.
import { getRssString } from '@astrojs/rss';
import { dayByKey, entries, site, titleOf } from '../lib/data';
import { MONTHS } from '../lib/church-year';
import { audioUrl, clock, episodes, feed, feedUrl } from '../lib/podcast';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s: string) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const art = new URL(feed.art, site.site).toString();

export async function GET() {
  const xml = await getRssString({
    title: feed.title,
    description: feed.description,
    site: site.site,
    trailingSlash: false,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      atom: 'http://www.w3.org/2005/Atom',
      podcast: 'https://podcastindex.org/namespace/1.0',
    },
    customData: [
      `<language>${esc(feed.language)}</language>`,
      `<atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml"/>`,
      feed.copyright ? `<copyright>${esc(feed.copyright)}</copyright>` : '',
      `<itunes:author>${esc(feed.author)}</itunes:author>`,
      `<itunes:owner><itunes:name>${esc(feed.owner_name)}</itunes:name><itunes:email>${esc(feed.owner_email)}</itunes:email></itunes:owner>`,
      `<itunes:image href="${esc(art)}"/>`,
      `<itunes:category text="${esc(feed.category)}"><itunes:category text="${esc(feed.subcategory)}"/></itunes:category>`,
      `<itunes:explicit>${feed.explicit ? 'true' : 'false'}</itunes:explicit>`,
      `<itunes:type>episodic</itunes:type>`,
    ].join(''),
    items: [...episodes].reverse().map((e) => {
      const d = dayByKey.get(e.key);
      const entry = entries.get(e.key);
      const [m, day] = e.key.split('-').map(Number);
      const page = `${site.site}/saint/${e.key}/`;
      const title = d ? titleOf(d) : e.key;
      const lede = entry ? plain(entry.body[0]) : '';
      const description = `${MONTHS[m - 1]} ${day}. ${lede}${lede ? ' ' : ''}Read the full entry: ${page}`.slice(0, 4000);
      return {
        title,
        link: page,
        pubDate: new Date(e.published),
        description,
        enclosure: { url: audioUrl(e), length: e.bytes, type: 'audio/mpeg' },
        customData:
          `<itunes:duration>${clock(e.seconds)}</itunes:duration>` +
          `<itunes:episodeType>full</itunes:episodeType>` +
          `<itunes:explicit>${feed.explicit ? 'true' : 'false'}</itunes:explicit>` +
          (feed.transcripts && entry ? `<podcast:transcript url="${esc(page)}" type="text/html"/>` : ''),
      };
    }),
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
