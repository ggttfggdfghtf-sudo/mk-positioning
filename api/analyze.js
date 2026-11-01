// Серверная функция для Vercel. Два режима:
//   mode: "variants" — разбирает ответы и предлагает 3 варианта позиционирования (микс тем в процентах)
//   mode: "pack"     — под выбранный вариант собирает упаковку профиля и контент
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   LLM_API_KEY    — ключ API (обязательно)
//   LLM_BASE_URL   — адрес OpenAI-совместимого API, например https://api.proxyapi.ru/openai/v1
//   LLM_MODEL      — модель для вариантов, по умолчанию gpt-4o-mini
//   LLM_MODEL_PACK — модель для упаковки (самая объёмная часть), по умолчанию gpt-4o
//   TG_BOT_TOKEN   — (необязательно) токен бота, который присылает вам ответы участников
//   TG_CHAT_ID     — (необязательно) id чата или группы, куда слать ответы
//   ALLOWED_ORIGIN — (необязательно) твой домен, если сайт и сервер на разных адресах

const ROLES = ["Эксперт", "Наставник", "Практик", "Вдохновляющая личность", "Интертейнер"];

const FIELDS = {
  name: "Имя",
  age: "Возраст",
  platforms: "Где ведёт или хочет вести блог",
  now: "О чём блог сейчас и в каком формате",
  worked: "Что из снятого зашло лучше всего",
  hours: "О чём может говорить часами",
  friends: "О чём спрашивают друзья",
  spend: "На что тратит время и деньги для себя",
  skill: "Что умеет лучше других / через что прошёл(а)",
  character: "Какой(ая) в жизни",
  camera: "Как ему комфортнее снимать",
  time: "Сколько времени готов(а) тратить на блог",
  audience: "Кого хочет видеть в подписчиках",
  goal: "Чего хочет от блога",
  idols: "Каких блогеров смотрит / на кого хочет быть похож(а)",
};

// Сколько роликов в неделю реально тянуть при таком времени
function pace(time) {
  const t = String(time || "").toLowerCase();
  if (t.includes("пара часов")) return { videos: 2, text: "2 ролика в неделю + сторис 3-4 дня" };
  if (t.includes("3-5")) return { videos: 3, text: "3 ролика в неделю + сторис почти каждый день" };
  if (t.includes("каждый день")) return { videos: 4, text: "4 ролика в неделю + сторис каждый день" };
  if (t.includes("сколько угодно")) return { videos: 5, text: "5 роликов в неделю + сторис каждый день" };
  return { videos: 3, text: "3 ролика в неделю + сторис почти каждый день" };
}

const IDEAS_RULES = `Как придумывать идеи роликов:
- Идея должна быть про ЭТОГО человека: с деталью из его ответов (его собака, его история, его город, его ошибка, его цифры). Если идею можно отдать любому блогеру в нише, она плохая.
- Хорошая идея = конкретная ситуация + конфликт, результат или цифра + понятно, что будет в кадре.
- Затёртые форматы НЕ предлагай в лоб: «типы людей», «ожидание vs реальность», «POV», «озвучиваю мысли собаки/кота», «день из моей жизни», «5 фактов обо мне», «GRWM», «распаковка», «топ-5 средств». Если формат всё-таки нужен, дай ему свой неожиданный угол.
- Примеры плохо → хорошо:
  плохо: «5 советов по уходу за волосами» → хорошо: «Я 2 года мыла голову не тем шампунем, и вот как это выглядело» (личная история + ошибка + результат)
  плохо: «Ожидание и реальность: завести собаку» → хорошо: «Сколько я реально потратила на шпица за первый год, по чекам» (цифра, честно, интересно даже не собачникам)
  плохо: «Типы студентов на паре» → хорошо: «Сдаю зачёт по конспекту, который написала нейросеть: честный результат» (эксперимент с исходом)
  плохо: «Мой уход за кожей» → хорошо: «Покупаю всё, что мне советуют в комментах, неделю мажусь и показываю итог» (вовлекает аудиторию + серия)
- Крючок (первая фраза) должен за 2 секунды обещать что-то конкретное: результат, цифру, ошибку, спор. Не «Привет, сегодня расскажу…».`;

const STYLE = `Как писать:
- Обращайся на «ты», простым разговорным языком, как живой человек пишет другу в телеге.
- Без канцелярита и маркетинговых слов («уникальный», «эксклюзивный», «раскрыть потенциал», «экспертный контент», «погрузиться»). Без эмодзи в тексте объяснений.
- Конкретно и с опорой на слова человека. Не пересказывай ответы, а делай выводы.
- Пиши так, как это реально написал бы блогер, а не агентство.`;

const SYSTEM_VARIANTS = `Ты опытный продюсер блогеров. Человек ответил на вопросы о себе. Найди его позиционирование и предложи 3 варианта.

Главное правило: позиционирование почти никогда не одна тема. Это МИКС тем в процентах. Например: 50% уход за волосами, 30% жизнь с собакой, 20% студенческие будни. Главная тема даёт пользу и причину подписаться, остальные добавляют личность.

Как думать:
- Смотри, что человек УЖЕ делает (формат, что зашло) и что ЛЮБИТ и УМЕЕТ. Самые сильные варианты на пересечении. Пример: снимает рофлы и любит собак → юмор про жизнь с собакой.
- Вариант 1 «Ближе к тому, что есть»: усиливаем текущий блог, без резких поворотов.
- Вариант 2 «Смежный»: соединяем текущий формат с тем, что человек любит или умеет.
- Вариант 3 «Смелый»: заметный поворот, но опираясь на его реальные интересы и опыт. Никаких тем с нуля.
- Варианты должны заметно отличаться: другой главной темой или другими пропорциями.
- В каждом варианте 3-4 темы, проценты в сумме ровно 100, у главной темы 40-60%.
- Учитывай цель: продавать услуги → нужна экспертная главная тема; реклама и охваты → широкая интересная тема; кайф → то, что заряжает.
- Роль выбирай из списка: ${ROLES.join(", ")}. Можно главную и вторую.
- Если ответов мало, всё равно предложи варианты, а в summary мягко скажи, что разбор будет точнее с подробными ответами.
- Названия направлений и темы микса тоже конкретные: не «Лайфстайл» и «Бьюти», а «Уход за волосами без салона», «Жизнь со шпицем в однушке».

Пример хорошего микса для человека, который снимает рофлы, любит собак и разбирается в волосах:
«Волосы без салона»: 50% уход за волосами дома (разборы средств из масс-маркета, мои ошибки после осветления), 30% жизнь со шпицем (как я ухаживаю за его шерстью, его характер), 20% студенческая жизнь с юмором (как я всё это успеваю между парами).
Плохой микс: 40% бьюти, 30% лайфстайл, 30% юмор (слишком общо, непонятно, что снимать).

${STYLE}

Ответь ТОЛЬКО JSON-объектом, без текста до и после:
{
  "summary": "2-3 предложения: что ты видишь в ответах и в чём его сильная сторона",
  "strengths": ["сильная сторона 1", "сильная сторона 2", "сильная сторона 3"],
  "role": {"main": "роль из списка", "second": "роль из списка или пустая строка", "why": "1-2 предложения почему"},
  "variants": [
    {
      "type": "Ближе к тому, что есть" | "Смежный" | "Смелый",
      "title": "название направления, до 6 слов",
      "idea": "2-3 предложения: про что блог и как он выглядит",
      "mix": [{"topic": "тема", "percent": 50, "what": "что конкретно постить по этой теме, 1 предложение"}],
      "audience": "кому это смотреть, в дательном падеже («девчонкам 16-20, которые…»)",
      "value": "что люди получают от блога",
      "why_you": "почему это подходит именно ему, со ссылкой на его ответы",
      "money": "как на этом можно зарабатывать, 1 предложение"
    }
  ],
  "tip": "одна вещь, которую стоит перестать делать или на что обратить внимание"
}
Ровно 3 варианта, порядок: Ближе к тому, что есть → Смежный → Смелый.`;

const SYSTEM_PACK = `Ты опытный продюсер блогеров и упаковщик профилей. Человек выбрал направление блога. Собери под него полную упаковку профиля и контента, чтобы он мог завтра всё поставить и начать снимать.

Правила:
- Всё строго под выбранное направление и его микс тем. Контент-план и рубрики распределяй по процентам микса.
- Учитывай площадку (Instagram, TikTok, YouTube, Telegram), сколько у человека времени и как ему комфортнее снимать.
- Поле «имя» в профиле: имя + ключевое слово темы, по нему ищут (до 30 символов, например «Аня | уход за волосами»).
- Шапка: 3-4 короткие строки, до 150 символов всего. Кто ты, про что блог, что получит подписчик, призыв. Можно 1-2 эмодзи в начале строк, если это уместно для площадки.
- Актуальные (или закреп в TikTok/Telegram): 4-6 штук, короткие названия до 12 символов.
- План должен быть реальным для человека: сколько роликов в неделю, указано ниже в сообщении. Не больше. Остальные дни: сторис или отдых. Лучше меньше, но чтобы человек не сдулся через неделю.
- Рубрики: 2-3 постоянных формата, которые можно повторять каждую неделю без мучений.

${IDEAS_RULES}

${STYLE}

Ответь ТОЛЬКО JSON-объектом, без текста до и после:
{
  "formula": "позиционирование одной фразой: Я ... . Показываю/рассказываю ... про ... . Со мной ты ...",
  "name_field": "поле имя в профиле",
  "usernames": ["вариант ника 1", "вариант ника 2", "вариант ника 3"],
  "bio": "шапка, строки через \\n",
  "bio_alt": "второй вариант шапки, другой по подаче, строки через \\n",
  "avatar": "какую поставить аватарку, 1-2 предложения",
  "highlights": [{"name": "название", "what": "что туда положить"}],
  "link": "что поставить по ссылке в профиле",
  "pinned": [{"title": "о чём закреп", "why": "зачем он нужен"}],
  "visual": "как должна выглядеть лента и видео: цвета, обложки, кадр, 2-3 предложения",
  "rubrics": [{"name": "название рубрики", "topic": "к какой теме микса относится", "what": "что это за формат", "freq": "как часто"}],
  "week": [{"day": "Пн", "topic": "тема микса", "format": "рилс / сторис / пост / видео", "idea": "конкретная идея"}],
  "first_videos": [{"title": "название ролика", "hook": "первая фраза или кадр, чтобы зацепить", "why": "почему это хороший старт"}],
  "stories": ["идея для сторис 1", "идея 2", "идея 3", "идея 4"],
  "dont": ["что не постить или не делать 1", "2", "3"],
  "first_steps": ["что сделать сегодня 1", "2", "3"]
}
Количество: usernames 3, highlights 4-6, pinned 3, rubrics 2-3, week ровно 7 дней Пн-Вс (format «рилс»/«видео» только в стольких днях, сколько роликов разрешено; в остальные «сторис» или «отдых»), first_videos 5, stories 4-6, dont 3, first_steps 3.`;

function clean(s, max) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
}
function lines(s, maxLines, maxLen) {
  return String(s || "").split(/\n|\\n/).map(l => clean(l, maxLen)).filter(Boolean).slice(0, maxLines).join("\n");
}
const arr = (x, n) => (Array.isArray(x) ? x : []).slice(0, n);

function parseJSON(text) {
  try { return JSON.parse(text); } catch (e) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a !== -1 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  return null;
}

function normMix(mix) {
  let m = arr(mix, 5).map(x => ({ topic: clean(x && x.topic, 60), percent: Math.max(0, Math.round(Number(x && x.percent) || 0)), what: clean(x && x.what, 250) }))
    .filter(x => x.topic);
  const sum = m.reduce((s, x) => s + x.percent, 0);
  if (m.length && sum !== 100) {
    if (sum === 0) m.forEach(x => (x.percent = Math.round(100 / m.length)));
    else m.forEach(x => (x.percent = Math.round((x.percent / sum) * 100)));
    const diff = 100 - m.reduce((s, x) => s + x.percent, 0);
    m[0].percent += diff;
  }
  return m.sort((a, b) => b.percent - a.percent);
}

function validateVariants(d) {
  if (!d || !Array.isArray(d.variants) || !d.variants.length) return null;
  return {
    summary: clean(d.summary, 800),
    strengths: arr(d.strengths, 4).map(s => clean(s, 150)).filter(Boolean),
    role: { main: clean(d.role && d.role.main, 40), second: clean(d.role && d.role.second, 40), why: clean(d.role && d.role.why, 500) },
    variants: d.variants.slice(0, 3).map(v => ({
      type: clean(v.type, 40), title: clean(v.title, 80), idea: clean(v.idea, 600),
      mix: normMix(v.mix), audience: clean(v.audience, 300), value: clean(v.value, 300),
      why_you: clean(v.why_you, 500), money: clean(v.money, 300),
    })).filter(v => v.title && v.mix.length),
    tip: clean(d.tip, 400),
  };
}

function validatePack(d) {
  if (!d || typeof d !== "object" || !d.bio) return null;
  const o = (x, keys) => { const r = {}; keys.forEach(([k, n]) => (r[k] = clean(x && x[k], n))); return r; };
  return {
    formula: clean(d.formula, 400),
    name_field: clean(d.name_field, 64),
    usernames: arr(d.usernames, 4).map(s => clean(s, 40)).filter(Boolean),
    bio: lines(d.bio, 5, 80),
    bio_alt: lines(d.bio_alt, 5, 80),
    avatar: clean(d.avatar, 300),
    highlights: arr(d.highlights, 6).map(x => o(x, [["name", 20], ["what", 200]])).filter(x => x.name),
    link: clean(d.link, 300),
    pinned: arr(d.pinned, 3).map(x => o(x, [["title", 150], ["why", 200]])).filter(x => x.title),
    visual: clean(d.visual, 500),
    rubrics: arr(d.rubrics, 5).map(x => o(x, [["name", 60], ["topic", 60], ["what", 250], ["freq", 60]])).filter(x => x.name),
    week: arr(d.week, 7).map(x => o(x, [["day", 4], ["topic", 60], ["format", 40], ["idea", 250]])).filter(x => x.day),
    first_videos: arr(d.first_videos, 6).map(x => o(x, [["title", 150], ["hook", 200], ["why", 200]])).filter(x => x.title),
    stories: arr(d.stories, 6).map(s => clean(s, 200)).filter(Boolean),
    dont: arr(d.dont, 4).map(s => clean(s, 200)).filter(Boolean),
    first_steps: arr(d.first_steps, 4).map(s => clean(s, 200)).filter(Boolean),
  };
}

async function ask(system, user, temperature, maxTokens, model) {
  const key = process.env.LLM_API_KEY;
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("LLM error", r.status, t.slice(0, 500));
    const e = new Error("llm"); e.status = r.status; throw e;
  }
  const data = await r.json();
  return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

// Отправка ответов участника вам в Telegram. Ошибки не мешают участнику.
async function notify(text) {
  const token = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!token || !chat) return;
  const parts = [];
  for (let i = 0; i < text.length && parts.length < 3; i += 3900) parts.push(text.slice(i, i + 3900));
  for (const part of parts) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
        body: JSON.stringify({ chat_id: chat, text: part, disable_web_page_preview: true }),
      });
      clearTimeout(timer);
    } catch (e) { console.error("telegram", e.message); }
  }
}

module.exports = async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.LLM_API_KEY) return res.status(500).json({ error: "no_key" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const answers = body.answers || {};
  const filled = Object.keys(FIELDS).filter(k => clean(answers[k], 10)).length;
  if (filled < 2) return res.status(400).json({ error: "too_empty" });
 const contact = clean(answers.contact, 80);
  const about = "Ответы человека:\n" + Object.entries(FIELDS).map(([k, l]) => `${l}: ${clean(answers[k], 800) || "(не ответил)"}`).join("\n");

  try {
    if (body.mode === "pack") {
      const v = body.variant || {};
      const mix = (Array.isArray(v.mix) ? v.mix : []).slice(0, 5).map(m => `${clean(m.percent, 4)}% ${clean(m.topic, 60)} (${clean(m.what, 200)})`).join("; ");
      if (!clean(v.title, 10) || !mix) return res.status(400).json({ error: "no_variant" });
      const role = body.role || {};
      const user = `${about}\n\nВыбранное направление: ${clean(v.title, 80)}\nСуть: ${clean(v.idea, 600)}\nМикс тем: ${mix}\nДля кого: ${clean(v.audience, 300)}\nЧто получают: ${clean(v.value, 300)}\nРоль: ${clean(role.main, 40)}${role.second ? " + " + clean(role.second, 40) : ""}`;
      const p = pace(answers.time);
      const text = await ask(SYSTEM_PACK, user + `\n\nВремя на блог: ${clean(answers.time, 60) || "не указал"}. Роликов в неделю: максимум ${p.videos}. Ритм: ${p.text}.`, 0.8, 3500, process.env.LLM_MODEL_PACK || "gpt-4o");
      const result = validatePack(parseJSON(text));
      if (!result) { console.error("Bad pack JSON", text.slice(0, 500)); return res.status(502).json({ error: "bad_json" }); }
      result.pace = p.text;
      await notify(`✅ ${clean(answers.name, 40) || "Участник"}${contact ? " (" + contact + ")" : ""} выбрал(а) направление: ${clean(v.title, 80)}\nМикс: ${mix}`);
      return res.status(200).json(result);
    }

    const avoid = Array.isArray(body.avoid) ? body.avoid.map(t => clean(t, 80)).filter(Boolean).slice(0, 6) : [];
    let user = about;
    if (avoid.length) user += `\n\nЭти направления ему уже предлагали, придумай другие: ${avoid.join("; ")}`;
    const text = await ask(SYSTEM_VARIANTS, user, avoid.length ? 1 : 0.8, 2500, process.env.LLM_MODEL || "gpt-4o-mini");
    const result = validateVariants(parseJSON(text));
    if (!result || !result.variants.length) { console.error("Bad variants JSON", text.slice(0, 500)); return res.status(502).json({ error: "bad_json" }); }
    if (!avoid.length) {
      await notify(`📝 Новые ответы: ${clean(answers.name, 40) || "без имени"}${contact ? "\nКонтакт: " + contact : ""}\n\n` +
        Object.entries(FIELDS).filter(([k]) => clean(answers[k], 5)).map(([k, l]) => `${l}: ${clean(answers[k], 600)}`).join("\n\n") +
        `\n\nРоль: ${result.role.main}${result.role.second ? " + " + result.role.second : ""}\nВарианты: ${result.variants.map(v => v.title).join(" | ")}`);
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: e.message === "llm" ? "llm" : "network" });
  }
};
