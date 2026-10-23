import { days, dayPayload } from '../../../lib/data';
export function getStaticPaths() { return days.map((d) => ({ params: { key: d.key } })); }
export const GET = ({ params }: { params: { key: string } }) =>
  new Response(JSON.stringify(dayPayload(params.key!)), { headers: { 'Content-Type': 'application/json' } });
