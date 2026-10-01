import type { APIRoute } from 'astro';

export const prerender = false;

const R2_PUBLIC_BASE = 'https://pub-becc7b2187614cf1bfb6cabab35271d2.r2.dev';

export interface ArtItem {
  id: string;
  name: string;
  filename: string;
  url: string;
  category: string;
  tag: string;
  size: number;
  uploaded: string;
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const localsAny = locals as any;
    const env = localsAny.runtime?.env || localsAny.cloudflare?.env || localsAny.env || {};
    const bucket = env.ARTCOLLECTION_BUCKET;

    if (!bucket) {
      return new Response(
        JSON.stringify({
          error: 'ARTCOLLECTION_BUCKET not found in runtime environment',
          items: [],
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    let truncated = true;
    let cursor: string | undefined = undefined;
    const allObjects: any[] = [];

    // Получаем все объекты с префиксом art/
    while (truncated) {
      const res: any = await bucket.list({
        prefix: 'art/',
        limit: 1000,
        cursor,
      });

      if (res?.objects) {
        allObjects.push(...res.objects);
      }

      truncated = !!res.truncated;
      cursor = res.cursor;
    }

    // Фильтруем папки и оставляем только графические файлы
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const validObjects = allObjects.filter((obj) => {
      if (!obj.key || obj.key.endsWith('/') || obj.size === 0) return false;
      const lower = obj.key.toLowerCase();
      return imageExtensions.some((ext) => lower.endsWith(ext));
    });

    const items: ArtItem[] = validObjects.map((obj, index) => {
      const filename = obj.key.replace(/^art\//, '');
      const rawName = filename.replace(/\.[^/.]+$/, '');
      const cleanName = rawName.replace(/_/g, ' ').trim();

      // Определение тегов и категорий
      let category = 'all';
      let tag = 'Архив';

      const lower = filename.toLowerCase();
      if (lower.includes('lorin') || lower.includes('лорин') || lower.includes('girl')) {
        category = 'lorin';
        tag = 'Лорин';
      } else if (lower.includes('veles') || lower.includes('велес') || lower.includes('man') || lower.includes('guy')) {
        category = 'veles';
        tag = 'Велес & Стражи';
      } else if (lower.includes('noir') || lower.includes('dark') || lower.includes('арт-деко')) {
        category = 'artdeco';
        tag = 'Тёмное Арт-деко';
      } else if (lower.includes('combat') || lower.includes('sword') || lower.includes('арен')) {
        category = 'combat';
        tag = 'Боевые Арены';
      }

      // Формируем прямую публичную ссылку на Cloudflare R2
      const encodedKey = obj.key
        .split('/')
        .map((segment: string) => encodeURIComponent(segment))
        .join('/');

      return {
        id: `art-${index + 1}`,
        name: cleanName || `Экспонат #${index + 1}`,
        filename,
        url: `${R2_PUBLIC_BASE}/${encodedKey}`,
        category,
        tag,
        size: obj.size,
        uploaded: obj.uploaded ? new Date(obj.uploaded).toISOString() : new Date().toISOString(),
      };
    });

    // Сортируем: свежие загрузки всегда в начале списка
    items.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());

    return new Response(
      JSON.stringify({
        success: true,
        count: items.length,
        items,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=120',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err.message || 'Внутренняя ошибка R2',
        items: [],
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }
};
