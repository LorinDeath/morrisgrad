import type { APIRoute } from 'astro';

// Обязательно: отключаем статический рендер для этого файла, чтобы работал POST
export const prerender = false;

// Интерфейс записи
interface ScoreRecord {
    name: string;
    score: number;
    date: number; // timestamp
    difficulty?: number; // Для Glush записей
}

// Вспомогательная функция для получения ключей с датами (как в leaderboard.js)
function getKeys() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const numberOfDays = Math.floor((now.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((now.getDay() + 1 + numberOfDays) / 7);
    
    return {
        daily: `daily_scores_${dateStr}`,
        weekly: `weekly_scores_${now.getFullYear()}_w${weekNum}`
    };
}

// Получаем доступ к KV через locals (предоставляется адаптером Cloudflare)
const getKV = (locals: any) => {
    return locals?.runtime?.env?.MORRISGRAD_DB;
};

// GET: Получение рекордов (Топ за день и Топ за неделю)
export const GET: APIRoute = async ({ locals }) => {
    const kv = getKV(locals);
    if (!kv) {
        // Если запускаем локально без wrangler, вернем пустоту, чтобы не падало
        console.log("KV не подключен (локальный режим)");
        return new Response(JSON.stringify({ daily: [], weekly: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }

    const { daily: dailyKey, weekly: weeklyKey } = getKeys();
    const daily = await kv.get(dailyKey, { type: 'json' }) || [];
    const weekly = await kv.get(weeklyKey, { type: 'json' }) || [];
    // Получаем список прошедших игру
    const glush = await kv.get('glush_records', { type: 'json' }) || [];

    return new Response(JSON.stringify({ daily, weekly, glush }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

// POST: Сохранение нового рекорда
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const body = await request.json();
        const { name, score, type, difficulty } = body;

        // Логика для "Glush" (Финал игры)
        if (type === 'glush') {
            // Валидация для финала (помягче)
            if (!name || typeof name !== 'string' || name.length < 1 || name.length > 20) {
                return new Response(JSON.stringify({ error: "Некорректное имя" }), { status: 400 });
            }
            // Разрешаем кириллицу, латиницу, цифры и базовые символы
            const safeName = name.replace(/[<>]/g, '').trim(); 

            const kv = getKV(locals);
            if (kv) {
                const key = 'glush_records';
                let list: ScoreRecord[] = (await kv.get(key, { type: 'json' })) || [];
                list.push({ name: safeName, score: 0, difficulty: Number(difficulty), date: Date.now() });
                // Храним последние 50 героев
                if (list.length > 50) list = list.slice(list.length - 50);
                await kv.put(key, JSON.stringify(list));
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
        } else {
            // Стандартная валидация для рекордов
            if (!name || typeof name !== 'string' || name.length < 2 || name.length > 6) {
                return new Response(JSON.stringify({ error: "Имя должно состоять от 2 до 6 символов" }), { status: 400 });
            }
            if (!/^[a-zA-Z]+$/.test(name)) {
                 return new Response(JSON.stringify({ error: "Только латинские буквы" }), { status: 400 });
            }
        }

        const newRecord: ScoreRecord = {
            name: name.toUpperCase(),
            score: Number(score),
            date: Date.now()
        };

        const kv = getKV(locals);

        if (kv) {
            const { daily: dailyKey, weekly: weeklyKey } = getKeys();

            // Функция обновления топа для конкретного ключа
            const updateTop = async (key: string) => {
                let list: ScoreRecord[] = (await kv.get(key, { type: 'json' })) || [];
                const minScore = list.length < 5 ? 0 : list[list.length - 1].score;
                if (newRecord.score > minScore) {
                    list.push(newRecord);
                    list.sort((a, b) => b.score - a.score);
                    list = list.slice(0, 5);
                    await kv.put(key, JSON.stringify(list));
                }
            };

            await updateTop(dailyKey);
            await updateTop(weeklyKey);
        } else {
            return new Response(JSON.stringify({ error: "База данных не настроена в Cloudflare" }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
};