import type { APIRoute } from 'astro';

const PROFANITY_PATTERN = /(?:ху[йиеяю]|пизд|бля[дт]|еба[тьнл]|ёб|муда[кч]|говн|дроч)/i;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const { author, name, text } = data;

    // Валидация (поля — только строки: объект/число раньше роняли обработчик в 500)
    if (typeof author !== 'string' || typeof name !== 'string' || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Все поля обязательны для заполнения.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (!author?.trim() || !name?.trim() || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Все поля обязательны для заполнения.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // строки и длина: заявка анонимная, без ограничений R2 можно было забить гигабайтами
    if (author.trim().length > 60 || name.trim().length > 150 || text.length > 200_000) {
      return new Response(
        JSON.stringify({ error: 'Слишком длинное поле (автор до 60, название до 150, текст до 200 000 символов).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (PROFANITY_PATTERN.test(name) || PROFANITY_PATTERN.test(text) || PROFANITY_PATTERN.test(author)) {
      return new Response(
        JSON.stringify({ error: 'Текст или поля содержат недопустимую лексику.' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Получаем окружение Cloudflare
    const localsAny = locals as any;
    const env = localsAny.runtime?.env || localsAny.cloudflare?.env || localsAny.env || {};

    const db = env.PROFILES_DB;
    const bucket = env.konkursbook;

    if (!db || !bucket) {
      return new Response(
        JSON.stringify({ error: 'Хранилище недоступно.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Сохраняем JSON рассказа в R2
    const fileId = crypto.randomUUID();
    const r2Key = `stories/${Date.now()}-${fileId}.json`;
    const storyPayload = JSON.stringify({
      id: fileId,
      name: name.trim(),
      author: author.trim(),
      text: text.trim(),
      createdAt: new Date().toISOString()
    }, null, 2);

    await bucket.put(r2Key, storyPayload, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' }
    });

    // Записываем строку в таблицу konkurs в PROFILES_DB
    await db.prepare(
      `INSERT INTO konkurs (author, name, urlrasskaz) VALUES (?, ?, ?)`
    ).bind(author.trim(), name.trim(), r2Key).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Заявка успешно принята!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[konkurs]', err);
    return new Response(
      JSON.stringify({ error: 'Ошибка сервера.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};