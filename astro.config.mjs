import { defineConfig } from 'astro/config';
import cfg from './site.config.json' with { type: 'json' };

export default defineConfig({
  site: cfg.site,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
