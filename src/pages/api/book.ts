import type { APIRoute } from 'astro';
import { getBookById, getAllBooks } from '../../utils/fb2';

export const GET: APIRoute = async ({ url }) => {
  try {
    const id = url.searchParams.get('id');
    if (id) {
      const book = await getBookById(id);
      return new Response(JSON.stringify(book), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30',
        },
      });
    }
    const all = await getAllBooks();
    return new Response(JSON.stringify(all), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка загрузки книги';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
};
