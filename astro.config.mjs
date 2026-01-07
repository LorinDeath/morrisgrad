// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // ... ваши текущие настройки
  adapter: cloudflare({
    // Добавьте эту опцию, чтобы исправить ошибку с sharp
    imageService: 'compile',
  }),
});
