import type { APIRoute } from 'astro';

export const prerender = false;
interface Env {
    PROFILES_DB: any;
}

export const POST: APIRoute = async ({ locals, request }) => {
    const cfRuntime = (locals as any)?.runtime;
    const env = cfRuntime?.env as Env;
    const db = env?.PROFILES_DB;

    // 1. Проверка авторизации и подключения к БД/R2
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (!db) {
        console.error("[Ascension API] Server configuration error: DB not connected.");
        return new Response(JSON.stringify({ error: "Server configuration error: DB or R2 Bucket not connected." }), { status: 500 });
    }

    try { await db.prepare("ALTER TABLE users ADD COLUMN hellfire INTEGER DEFAULT 0").run(); } catch (e) {}

    try {
        const formData = await request.formData();
        const itemString = formData.get("item") as string;
        const score = Number(formData.get("score") as string);

        if (!itemString || isNaN(score)) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const item = JSON.parse(itemString);

        // 2. Логика загрузки иконки в R2 и обработки Base64 удалена по запросу.
        // Предметы будут сохраняться в игре с их оригинальными иконками (например, эмодзи).

        // 3. НОВАЯ ЛОГИКА: Шанс сохранения предмета после возвышения.
        // Чем выше score, тем выше шанс, что предмет не сломается. Максимум 95% шанс.
        const SCORE_FOR_MAX_CHANCE = 40000; // Очки, необходимые для максимального шанса
        const chanceToSave = Math.min(0.95, score / SCORE_FOR_MAX_CHANCE);
        const isSaved = Math.random() < chanceToSave;

        let returnedItem = null;
        if (isSaved) {
            item.infected = true; // Помечаем предмет как "зараженный"
            returnedItem = item;
        }

        // 4. Расчет и добавление Адского Пламени (ОТКЛЮЧЕНО ПО ЗАПРОСУ)
        // const hellfireGained = Math.floor(score / 10000);
        // if (hellfireGained > 0) { ... }

        return new Response(JSON.stringify({
            success: true,
            hellfire: 0, // Адское пламя больше не начисляется
            item: returnedItem, // Возвращаем предмет (или null, если он сломался)
            isSaved: isSaved, // Флаг для клиента, чтобы показать результат
            chance: chanceToSave // Отправляем шанс на клиент, чтобы его можно было показать игроку
        }), { status: 200 });

    } catch (e: any) {
        console.error("[Ascension API] Error:", e);
        return new Response(JSON.stringify({ error: "Server error processing ascension.", details: e.message }), { status: 500 });
    }
};