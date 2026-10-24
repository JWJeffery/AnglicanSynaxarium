// Podcast episodes. data/episodes.json is written by tools/add-episodes.py; nothing here is edited by hand.
import fs from 'node:fs';
import path from 'node:path';
import cfg from '../../site.config.json';

export interface Episode {
  key: string;        // MM-DD, matches the day
  file: string;       // file name inside /audio/ on the server
  bytes: number;      // exact size of the served file (the feed's enclosure length)
  seconds: number;    // running time
  published: string;  // ISO time in UTC when the episode goes live
}

export const feed = cfg.feed;
export const feedUrl = `${cfg.site}/feed.xml`;
export const audioUrl = (e: Episode) => `${cfg.site}/audio/${e.file}`;

const file = path.resolve('data/episodes.json');
const raw: { episodes: Episode[] } = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : { episodes: [] };
export const episodes: Episode[] = [...raw.episodes].sort((a, b) => a.published.localeCompare(b.published));
export const episodeByKey = new Map(episodes.map((e) => [e.key, e]));
export const hasFeed = episodes.length > 0;

export function clock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(h)}:${two(m)}:${two(r)}`;
}
