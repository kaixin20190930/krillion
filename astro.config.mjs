import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://krillion.tips',
  output: 'static',
  build: {
    format: 'directory',
  },
});
