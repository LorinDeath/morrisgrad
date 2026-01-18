import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare'; // Оставляем этот!
import clerk from '@clerk/astro';

export default defineConfig({
  // 1. Устанавливаем режим сервера (как просит инструкция)
  output: 'server', 

  // 2. Используем ТВОЙ адаптер Cloudflare, а не Node
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: {
      enabled: true,
    },
  }),

  // 3. Добавляем интеграцию Clerk
  integrations: [clerk()],
});