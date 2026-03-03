import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
    PROFILES_DB: any;
    ITEMICONS_BUCKET: any;
    ITEMICONS_R2_PUBLIC_DOMAIN: string;
}

export const POST: APIRoute = async ({ locals, request }) => {
    const cfRuntime = (locals as any)?.runtime;
    const env = cfRuntime?.env as Env;
    const db = env?.PROFILES_DB;
    const bucket = env?.ITEMICONS_BUCKET;
    // Публичный домен для иконок предметов (отдельный от аватарок)
    const R2_PUBLIC_DOMAIN = "https://pub-d8e6445004d840e3a681ccd3b2941e20.r2.dev";

    // 1. Проверка авторизации и подключения к БД/R2
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (!db || !bucket || !R2_PUBLIC_DOMAIN) {
        console.error("[Ascension API] Server configuration error: DB or R2 Bucket not connected.");
        console.log(`DB: ${!!db}, Bucket: ${!!bucket}, Domain: ${!!R2_PUBLIC_DOMAIN}`);
        return new Response(JSON.stringify({ error: "Server configuration error: DB or R2 Bucket not connected." }), { status: 500 });
    }

    try {
        const formData = await request.formData();
        const itemString = formData.get("item") as string;
        const returnedItemsString = formData.get("returned_items") as string | null;
        const score = Number(formData.get("score") as string);
        const iconFile = formData.get("icon_file") as File | null;

        if (!itemString || isNaN(score)) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const item = JSON.parse(itemString);
        const returnedItems = returnedItemsString ? JSON.parse(returnedItemsString) : [];

        // 2. Обработка загрузки иконки
        if (iconFile && iconFile.size > 0) {
            // Безопасная проверка на стороне сервера
            if (iconFile.size > 2 * 1024 * 1024) {
                 return new Response(JSON.stringify({ error: "File is too large (max 2MB)." }), { status: 400 });
            }
            
            try {
                const key = `item-${userId}-${Date.now()}`;
                await bucket.put(key, await iconFile.arrayBuffer(), {
                    httpMetadata: { contentType: iconFile.type }
                });
                // Заменяем иконку-эмодзи на URL
                item.icon = `${R2_PUBLIC_DOMAIN}/${key}`;
            } catch (err) {
                console.error("[Ascension API] R2 Upload Error:", err);
                return new Response(JSON.stringify({ error: "Failed to upload icon." }), { status: 500 });
            }
        }

        // 3. Сохранение вознесенного предмета в таблицу user_items
        await db.prepare(`
            INSERT INTO user_items (uuid, user_id, item_id, name, description, source, type, rarity, stats, icon, set_id, set_stats, is_corrupted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            item.id,
            userId,
            item.name, // item_id для группировки
            item.name, // name для отображения
            item.desc || 'Вознесенный предмет',
            item.source || 'Возвышение',
            item.type,
            item.rarity,
            JSON.stringify(item.stats || {}),
            item.icon, // URL или эмодзи
            item.setId,
            JSON.stringify(item.setStats || {}),
            item.isCorrupted ? 1 : 0,
            Date.now()
        ).run();

        // 4. Сохранение возвращенных зараженных предметов
        if (returnedItems.length > 0) {
            const stmt = db.prepare(`
                INSERT INTO user_items (uuid, user_id, item_id, name, description, source, type, rarity, stats, icon, set_id, set_stats, is_corrupted, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const batch = returnedItems.map((retItem: any) => stmt.bind(
                retItem.id, userId, retItem.name, retItem.name,
                retItem.desc || 'Возвращенный предмет', 'Возврат после Возвышения',
                retItem.type, retItem.rarity, JSON.stringify(retItem.stats || {}),
                retItem.icon, retItem.setId, JSON.stringify(retItem.setStats || {}), retItem.isCorrupted ? 1 : 0, Date.now()
            ));
            await db.batch(batch);
        }

        // 5. Расчет и добавление Адского Огня
        const hellfireGained = Math.floor(score / 10000);
        if (hellfireGained > 0) {
            await db.prepare("UPDATE users SET hellfire = hellfire + ? WHERE id = ?")
              .bind(hellfireGained, userId)
              .run();
        }

        // 6. Успешный ответ
        return new Response(JSON.stringify({ success: true, hellfire: hellfireGained }), { status: 200 });

    } catch (e: any) {
        console.error("[Ascension API] Error:", e);
        return new Response(JSON.stringify({ error: "Server error processing ascension.", details: e.message }), { status: 500 });
    }
};