import { days, site, hasAbout } from '../lib/data';
import { MONTH_SLUGS } from '../lib/church-year';
export const GET = () => {
  const paths = ['/', '/kalendar/', '/saints/', '/suggest/', '/reminders/', '/print/', ...(hasAbout ? ['/about/'] : []), '/credits/', ...MONTH_SLUGS.map((m) => `/kalendar/${m}/`), ...days.map((d) => `/saint/${d.key}/`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `<url><loc>${site.site}${p}</loc></url>`).join('\n') + '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
