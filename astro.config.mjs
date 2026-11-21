import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://krillion.tips',
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  build: {
    format: 'directory',
  },
});
