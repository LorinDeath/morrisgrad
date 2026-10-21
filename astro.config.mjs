import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import mcAssets from './tools/mc-assets/manifest.mjs'; // манифест ресурсов «Проклятых» (кэш у игрока, public/mc-sw.js)

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
    mcAssets(),
    // карта сайта — динамическая: src/pages/sitemap*.xml.ts (с темами форума)
  ],
});