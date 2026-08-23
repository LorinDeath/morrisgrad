import type { APIRoute } from 'astro';

// Простой базовый фильтр ненормативной лексики
const PROFANITY_PATTERN = /(?:ху[йиеяю]|пизд|бля[дт]|еба[тьнл]|ёб|муда[кч]|говн|дроч)/i;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const { author, name, text } = data;

    // 1. Валидация входных данных
    if (!author?.trim() || !name?.trim() || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Все поля обязательны для заполнения.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (name.length > 150) {
      return new Response(
        JSON.stringify({ error: 'Название рассказа не должно превышать 150 символов.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (text.length < 100) {
      return new Response(
        JSON.stringify({ error: 'Рассказ слишком короткий (минимум 100 символов).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Проверка на ненормативную лексику
    if (PROFANITY_PATTERN.test(name) || PROFANITY_PATTERN.test(text) || PROFANITY_PATTERN.test(author)) {
      return new Response(
        JSON.stringify({ error: 'Текст или поля содержат недопустимую лексику. Пожалуйста, отредактируйте работу.' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Доступ к Cloudflare Bindings (D1 и R2)
    const runtime = locals.runtime?.env;
    if (!runtime?.DB || !runtime?.konkursbook) {
      return new Response(
        JSON.stringify({ error: 'Ошибка конфигурации Cloudflare Bindings (D1 / R2).' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { DB, konkursbook } = runtime;

    // 4. Генерация ключа и сохранение рассказа в R2
    const fileId = crypto.randomUUID();
    const r2Key = `stories/${Date.now()}-${fileId}.json`;
    const storyPayload = JSON.stringify({
      id: fileId,
      name: name.trim(),
      author: author.trim(),
      text: text.trim(),
      createdAt: new Date().toISOString()
    }, null, 2);

    await konkursbook.put(r2Key, storyPayload, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' }
    });

    // 5. Запись в SQLite D1
    // Таблица: konkurs (author TEXT, name TEXT, urlrasskaz TEXT)
    await DB.prepare(
      `INSERT INTO konkurs (author, name, urlrasskaz) VALUES (?, ?, ?)`
    ).bind(author.trim(), name.trim(), r2Key).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Заявка успешно принята!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Внутренняя ошибка сервера.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};