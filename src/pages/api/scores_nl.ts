import type { APIRoute } from 'astro';
import { guardAnonWrite, envOf } from '../../lib/antiabuse';

export const prerender = false;

interface ScoreRecord {
    name: string;
    score: number;
    date: number;
}

function getKeys() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const numberOfDays = Math.floor((now.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((now.getDay() + 1 + numberOfDays) / 7);
    
    return {
        daily: `nl_dayscore_${dateStr}`,
        weekly: `nl_weekscore_${now.getFullYear()}_w${weekNum}`
    };
}

const getKV = (locals: any) => {
    return locals?.runtime?.env?.MORRISGRAD_DB;
};

export const GET: APIRoute = async ({ locals }) => {
    const kv = getKV(locals);
    if (!kv) {
        return new Response(JSON.stringify({ daily: [], weekly: [] }), { status: 200 });
    }

    const { daily: dailyKey, weekly: weeklyKey } = getKeys();
    const daily = await kv.get(dailyKey, { type: 'json' }) || [];
    const weekly = await kv.get(weeklyKey, { type: 'json' }) || [];

    return new Response(JSON.stringify({ daily, weekly }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
};

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        // анонимная запись: лимит с одного IP (+ Turnstile по флагу TURNSTILE_ENABLED)
        const denied = await guardAnonWrite(envOf(locals), 'scores', request);
        if (denied) return denied;
        const raw = await request.text();
        if (raw.length > 2048) return new Response(JSON.stringify({ error: "Слишком большой запрос" }), { status: 413 });
        const body = JSON.parse(raw);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(JSON.stringify({ error: "Некорректный запрос" }), { status: 400 });
        const { name, score } = body;

        // Валидация: 2-6 символов, только латиница
        if (!name || typeof name !== 'string' || name.length < 2 || name.length > 6) {
            return new Response(JSON.stringify({ error: "Name must be 2-6 chars" }), { status: 400 });
        }
        if (!/^[a-zA-Z]+$/.test(name)) {
             return new Response(JSON.stringify({ error: "Latin letters only" }), { status: 400 });
        }

        // очки — конечное целое в разумных пределах (раньше NaN/Infinity/1e308 ломали таблицу)
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1e9) {
            return new Response(JSON.stringify({ error: "Invalid score" }), { status: 400 });
        }
        const newRecord: ScoreRecord = {
            name: name.toUpperCase(),
            score: Math.floor(Number(score)),
            date: Date.now()
        };

        const kv = getKV(locals);
        if (kv) {
            const { daily: dailyKey, weekly: weeklyKey } = getKeys();

            const updateTop = async (key: string) => {
                let list: ScoreRecord[] = (await kv.get(key, { type: 'json' })) || [];
                // Проверяем, попадает ли в топ 5
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
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Server Error" }), { status: 500 });
    }
};
