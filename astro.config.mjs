import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import mcAssets from './tools/mc-assets/manifest.mjs'; // манифест ресурсов «Проклятых» (кэш у игрока, public/mc-sw.js)
import { mcClerkAppearance, mcClerkLocalization } from './src/lib/clerkTheme.ts';

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
    // вход Clerk на всём сайте и в игре: тёмный «проклятый» вид + русский язык (src/lib/clerkTheme.ts — один источник)
    clerk({ appearance: mcClerkAppearance, localization: mcClerkLocalization }),
    mcAssets(),
    // карта сайта — динамическая: src/pages/sitemap*.xml.ts (с темами форума)
  ],
});