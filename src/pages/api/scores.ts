import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

// Обязательно: отключаем статический рендер для этого файла, чтобы работал POST
export const prerender = false;

// Путь к файлу-базе данных (будет лежать в корне проекта в папке data)
const DATA_DIR = path.resolve('./data');
const DB_PATH = path.join(DATA_DIR, 'scores.json');

// Интерфейс записи
interface ScoreRecord {
    name: string;
    score: number;
    date: number; // timestamp
}

// Помощник для чтения БД
function readDb(): ScoreRecord[] {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(DB_PATH)) {
            fs.writeFileSync(DB_PATH, JSON.stringify([]));
            return [];
        }
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(fileContent);
    } catch (e) {
        console.error("Ошибка чтения БД:", e);
        return [];
    }
}

// Помощник для записи в БД
function writeDb(data: ScoreRecord[]) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Ошибка записи БД:", e);
    }
}

// GET: Получение рекордов (Топ за день и Топ за неделю)
export const GET: APIRoute = async () => {
    const allScores = readDb();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Фильтруем старые записи (старше недели удаляем из выборки, 
    // в реальной БД можно чистить кроном, тут просто фильтруем при отдаче)
    
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
export const POST: APIRoute = async ({ request }) => {
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

        const currentDb = readDb();
        currentDb.push(newRecord);
        
        // Очистка совсем старых записей (старше недели), чтобы файл не пух
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const cleanedDb = currentDb.filter(r => (Date.now() - r.date) < oneWeek);

        writeDb(cleanedDb);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
};