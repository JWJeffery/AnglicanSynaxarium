import { kalendarIndex } from '../../lib/data';
export const GET = () => new Response(JSON.stringify(kalendarIndex()), { headers: { 'Content-Type': 'application/json' } });
