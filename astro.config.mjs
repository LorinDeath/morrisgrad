import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';

export default defineConfig({
  // Указываем домен для sitemap
  site: 'https://morrisgrad.com/',

  // Указываем режим сервера
  output: 'server',

  // Адаптер Cloudflare
  adapter: cloudflare({
    imageService: 'compile', // картинки только при сборке (sharp), без привязки Cloudflare Images

  }),

  // Сессии Astro не используются — без KV-привязки SESSION (иначе адаптер требует её создать)
  session: false,

  // Все интеграции в одном массиве
  integrations: [
    clerk(),
    // карта сайта — динамическая: src/pages/sitemap*.xml.ts (с темами форума)
  ],
});