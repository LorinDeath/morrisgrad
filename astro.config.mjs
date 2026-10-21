import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import { mcClerkAppearance, mcClerkLocalization } from './src/lib/clerkTheme.ts';

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
    // вход Clerk на всём сайте и в игре: тёмный «проклятый» вид + русский язык (src/lib/clerkTheme.ts — один источник)
    clerk({ appearance: mcClerkAppearance, localization: mcClerkLocalization }),
    // карта сайта — динамическая: src/pages/sitemap*.xml.ts (с темами форума)
  ],
});