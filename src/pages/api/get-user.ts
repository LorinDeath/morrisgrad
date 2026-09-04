import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    
    // 1. Берем ID: сначала из параметра запроса, если пусто — из серверного auth()
    let userId = url.searchParams.get('userId');

    if (!userId) {
      try {
        const auth = (locals as any).auth?.();
        userId = auth?.userId || null;
      } catch (e) {}
    }

    if (!userId) {
      return new Response(JSON.stringify({ 
        username: 'Странник', 
        error: 'ID пользователя не передан' 
      }), { status: 200 });
    }

    // 2. Ищем базу Cloudflare D1 в окружении
    const runtime = (locals as any).runtime;
    const env = runtime?.env || {};
    const db = env.morrisgrad_db || env.DB || Object.values(env).find((val: any) => typeof val?.prepare === 'function');

    if (!db) {
      return new Response(JSON.stringify({ 
        username: 'Странник (Без DB)', 
        error: 'D1 binding не найден в Cloudflare Pages' 
      }), { status: 200 });
    }

    // 3. Достаем ник из таблицы users
    const user = await db
      .prepare('SELECT username FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first();

    if (!user || !user.username) {
      return new Response(JSON.stringify({ 
        username: 'Безымянный', 
        error: 'Пользователь не найден в таблице users' 
      }), { status: 200 });
    }

    return new Response(JSON.stringify({ 
      username: user.username 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ 
      username: 'Странник', 
      error: err?.message 
    }), { status: 500 });
  }
};