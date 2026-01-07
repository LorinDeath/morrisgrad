import type { APIRoute } from 'astro';

// Обязательно: отключаем статический рендер для этого файла, чтобы работал POST
export const prerender = false;

// Интерфейс записи
interface ScoreRecord {
    name: string;
    score: number;
    date: number; // timestamp
}

// Получаем доступ к KV через locals (предоставляется адаптером Cloudflare)
const getKV = (locals: any) => {
    return locals?.runtime?.env?.MORRISGRAD_DB;
};

// GET: Получение рекордов (Топ за день и Топ за неделю)
export const GET: APIRoute = async ({ locals }) => {
    const kv = getKV(locals);
    let allScores: ScoreRecord[] = [];

    if (kv) {
        // Читаем из KV
        const data = await kv.get('scores', { type: 'json' });
        if (data) allScores = data as ScoreRecord[];
    } else {
        // Если запускаем локально без wrangler, вернем пустоту, чтобы не падало
        console.log("KV не подключен (локальный режим)");
    }

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Топ за день
    const daily = allScores
        .filter(r => (now - r.date) < oneDay)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    // Топ за неделю
    const weekly = allScores
        .filter(r => (now - r.date) < oneWeek)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    return new Response(JSON.stringify({ daily, weekly }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

// POST: Сохранение нового рекорда
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const body = await request.json();
        const { name, score } = body;

        // Валидация на сервере
        if (!name || typeof name !== 'string' || name.length < 2 || name.length > 6) {
            return new Response(JSON.stringify({ error: "Имя должно состоять от 2 до 6 символов" }), { status: 400 });
        }
        
        // Проверка на латиницу
        const latinRegex = /^[a-zA-Z]+$/;
        if (!latinRegex.test(name)) {
             return new Response(JSON.stringify({ error: "Только латинские буквы" }), { status: 400 });
        }

        const newRecord: ScoreRecord = {
            name: name.toUpperCase(),
            score: Number(score),
            date: Date.now()
        };

        const kv = getKV(locals);

        if (kv) {
            // Читаем текущие, добавляем, сохраняем
            const currentData: ScoreRecord[] = (await kv.get('scores', { type: 'json' })) || [];
            currentData.push(newRecord);
            
            // Очистка совсем старых записей (старше недели)
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            const cleanedDb = currentData.filter((r: ScoreRecord) => (Date.now() - r.date) < oneWeek);

            await kv.put('scores', JSON.stringify(cleanedDb));
        } else {
            return new Response(JSON.stringify({ error: "База данных не настроена в Cloudflare" }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
};