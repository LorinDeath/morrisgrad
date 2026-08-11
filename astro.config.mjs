import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Указываем домен для sitemap
  site: 'https://morrisgrad.com/',

  // Указываем режим сервера
  output: 'server',

  // Адаптер Cloudflare
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: {
      enabled: true,
    },
  }),

  // Все интеграции в одном массиве
  integrations: [
    clerk(),
    sitemap(),
  ],
});