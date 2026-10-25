// Read by The Universal Office: the "Welcome" trailer, shown until the first daily episode is released.
import { audioUrl, episodeByKey, episodes } from '../../lib/podcast';
import { site } from '../../lib/data';

export const GET = () => {
  const t = episodeByKey.get('welcome');
  const firstDaily = episodes.find((e) => e.kind !== 'trailer');
  const body = {
    episode: t
      ? { url: audioUrl(t), page: `${site.site}/#welcome`, seconds: t.seconds, published: t.published, listen: site.podcast }
      : null,
    until: firstDaily ? firstDaily.published : null,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
