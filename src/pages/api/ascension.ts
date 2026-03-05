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

    try { await db.prepare("ALTER TABLE users ADD COLUMN hellfire INTEGER DEFAULT 0").run(); } catch (e) {}

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

        // 2. Обработка загрузки иконки (Приоритет 1: Файл из FormData)
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
        // 2.1 Обработка Base64 (Приоритет 2: Если иконка пришла строкой data:image/...)
        else if (item.icon && typeof item.icon === 'string' && item.icon.startsWith('data:image')) {
            try {
                // Парсим Base64
                const matches = item.icon.match(/^data:(.+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const contentType = matches[1];
                    const base64Data = matches[2];
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    const key = `item-${userId}-${Date.now()}-b64`;
                    await bucket.put(key, bytes.buffer, {
                        httpMetadata: { contentType: contentType }
                    });
                    
                    // Обновляем иконку на URL
                    item.icon = `${R2_PUBLIC_DOMAIN}/${key}`;
                }
            } catch (err) {
                // Если не получилось загрузить base64, ставим иконку по умолчанию (чтобы не сломать предмет)
                console.error("[Ascension API] Base64 Upload Error, setting default icon:", err);
                item.icon = '📦'; // Иконка по умолчанию

            }
        }

        // 3. (УДАЛЕНО) Автоматическое сохранение в БД отключено.
        // Предмет возвращается клиенту с обновленной ссылкой на иконку.
        // Клиент сохраняет его локально, а загрузка в БД происходит вручную через инвентарь.

        // 5. Расчет и добавление Адского Огня
        const hellfireGained = Math.floor(score / 10000);
        if (hellfireGained > 0) {
            try {
                await db.prepare("UPDATE users SET hellfire = hellfire + ? WHERE id = ?")
                  .bind(hellfireGained, userId)
                  .run();
            } catch (err) {
                console.error("[Ascension API] Failed to update hellfire:", err);
            }
        }

        // 6. Успешный ответ
        return new Response(JSON.stringify({ success: true, hellfire: hellfireGained, item: item }), { status: 200 });

    } catch (e: any) {
        console.error("[Ascension API] Error:", e);
        return new Response(JSON.stringify({ error: "Server error processing ascension.", details: e.message }), { status: 500 });
    }
};