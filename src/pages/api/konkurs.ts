import type { APIRoute } from 'astro';

const PROFANITY_PATTERN = /(?:ху[йиеяю]|пизд|бля[дт]|еба[тьнл]|ёб|муда[кч]|говн|дроч)/i;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const { author, name, text } = data;

    // Валидация
    if (!author?.trim() || !name?.trim() || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Все поля обязательны для заполнения.' }),
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
        JSON.stringify({ error: 'Ошибка доступа к PROFILES_DB или бакету konkursbook.' }),
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
    return new Response(
      JSON.stringify({ error: err.message || 'Ошибка сервера.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};