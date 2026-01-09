export const prerender = false;

// Вспомогательная функция для получения ключей с датами
function getKeys() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // "2026-01-07"
  
  // Простой ключ для недели (Год + номер недели)
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const numberOfDays = Math.floor((now - oneJan) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((now.getDay() + 1 + numberOfDays) / 7);
  
  return {
    daily: `daily_scores_${dateStr}`,
    weekly: `weekly_scores_${now.getFullYear()}_w${weekNum}`
  };
}

export const GET = async ({ locals }) => {
  const { daily: dailyKey, weekly: weeklyKey } = getKeys();
  const db = locals.runtime.env.MORRISGRAD_DB;
  
  // Загружаем данные по актуальным ключам
  const daily = await db.get(dailyKey, { type: 'json' }) || [];
  const weekly = await db.get(weeklyKey, { type: 'json' }) || [];
  
  return new Response(JSON.stringify({ daily, weekly }));
};

export const POST = async ({ request, locals }) => {
  try {
    const { name, score } = await request.json();
    const db = locals.runtime.env.MORRISGRAD_DB;
    const { daily: dailyKey, weekly: weeklyKey } = getKeys();

    // Функция проверки и обновления топа
    async function updateTop(key) {
      let list = await db.get(key, { type: 'json' }) || [];
      
      // Порог вхождения: если список не полон (меньше 5), то 0, иначе очки 5-го места
      const minScore = list.length < 5 ? 0 : list[list.length - 1].score;

      if (score > minScore) {
        // Добавляем нового игрока
        list.push({ name, score, date: new Date().toISOString() });
        // Сортируем по убыванию
        list.sort((a, b) => b.score - a.score);
        // Оставляем только топ-5
        list = list.slice(0, 5);
        // Сохраняем обратно в базу
        await db.put(key, JSON.stringify(list));
        return true; // Рекорд побит
      }
      return false; // Не дотянул
    }

    // Проверяем для дня и недели
    const isDaily = await updateTop(dailyKey);
    const isWeekly = await updateTop(weeklyKey);

    if (isDaily || isWeekly) {
      return new Response(JSON.stringify({ status: 'new_record', message: 'Новый рекорд!' }));
    } else {
      return new Response(JSON.stringify({ status: 'game_over', message: 'Попробуйте еще раз' }));
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
