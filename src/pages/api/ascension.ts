import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
    PROFILES_DB: any;
    AVATARS_BUCKET: any;
}

const R2_PUBLIC_DOMAIN = "https://pub-c6960920bfb44496a89753f220db1147.r2.dev"; 

export const POST: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    const bucket = env?.AVATARS_BUCKET;
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (!db) return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });

    try {
        const formData = await request.formData();
        const itemJson = formData.get('item') as string;
        const score = Number(formData.get('score') || 0);
        const iconFile = formData.get('icon_file') as File | null;

        if (!itemJson) return new Response(JSON.stringify({ error: "No item data" }), { status: 400 });

        const item = JSON.parse(itemJson);
        
        // Handle Icon Upload
        let iconUrl = item.icon; // Default to existing icon (emoji)
        if (iconFile && iconFile.size > 0 && bucket) {
             // Validate size again on server
             if (iconFile.size > 5 * 1024 * 1024) {
                 return new Response(JSON.stringify({ error: "File too large" }), { status: 400 });
             }
             
             const key = `item-${userId}-${Date.now()}`;
             await bucket.put(key, await iconFile.arrayBuffer(), {
                httpMetadata: { contentType: iconFile.type }
             });
             iconUrl = `${R2_PUBLIC_DOMAIN}/${key}`;
        }

        // Ensure tables exist / Migration
        try { await db.prepare("ALTER TABLE users ADD COLUMN hellfire INTEGER DEFAULT 0").run(); } catch (e) {}
        
        // Calculate Hellfire (1 per 100k score)
        const hellfireAmount = Math.floor(score / 100000);

        // Save Item
        await db.prepare(`
            INSERT INTO user_items (uuid, user_id, item_id, name, description, source, type, rarity, stats, icon, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            crypto.randomUUID(),
            userId,
            item.id || 'ascended',
            item.name,
            item.desc || '',
            'Ascension', // Source
            item.type,
            'divine', // Ascended items are Divine rarity
            JSON.stringify(item.stats || {}),
            iconUrl,
            Date.now()
        ).run();

        // Update User Hellfire
        if (hellfireAmount > 0) {
            await db.prepare("UPDATE users SET hellfire = COALESCE(hellfire, 0) + ? WHERE id = ?").bind(hellfireAmount, userId).run();
        }

        return new Response(JSON.stringify({ success: true, hellfire: hellfireAmount }), { status: 200 });

    } catch (e: any) {
        console.error("Ascension Error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
