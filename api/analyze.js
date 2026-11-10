// Серверная функция для Vercel. Два режима:
//   mode: "variants" — разбирает ответы и предлагает 3 варианта позиционирования (зонтик + рубрики)
//   mode: "pack"     — под выбранный вариант собирает упаковку профиля и контент
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   LLM_API_KEY    — ключ API (обязательно)
//   LLM_BASE_URL   — адрес OpenAI-совместимого API, например https://api.proxyapi.ru/openai/v1
//   LLM_MODEL      — модель для вариантов, по умолчанию gpt-4o-mini
//   LLM_MODEL_PACK — модель для упаковки, по умолчанию gpt-4o
//   TG_BOT_TOKEN   — (необязательно) токен бота, который присылает вам ответы участников
//   TG_CHAT_ID     — (необязательно) id чата или группы, куда слать ответы
//   ALLOWED_ORIGIN — (необязательно) твой домен, если сайт и сервер на разных адресах

const ROLES = ["Эксперт", "Наставник", "Практик", "Вдохновитель", "Развлекатель"];

const FIELDS = {
  name: "Имя",
  age: "Возраст",
  platforms: "Где ведёт или хочет вести блог",
  now: "О чём блог сейчас и в каком формате",
  worked: "Что из снятого зашло лучше всего",
  hours: "О чём может говорить часами",
  friends: "О чём спрашивают друзья",
  spend: "На что тратит время и деньги для себя",
  skill: "Что умеет лучше других / через что прошла",
  against: "Что бесит в блогах на её тему / с чем не согласна",
  character: "Какая в жизни",
  camera: "Как комфортнее снимать",
  time: "Сколько времени готова тратить на блог",
  audience: "Кого хочет видеть в подписчиках",
  goal: "Чего хочет от блога",
  idols: "Каких блогеров смотрит",
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

const STYLE = `Как писать:
- Обращайся на «ты», простым разговорным языком, как старшая подруга-блогер пишет в телеге. Аудитория в основном девочки 13-20 лет.
- Без канцелярита и маркетинговых слов («уникальный», «раскрыть потенциал», «экспертный контент», «погрузиться», «творческая личность», «делюсь вдохновением», «позитив»). Без эмодзи в объяснениях.
- Только конкретика с опорой на слова человека. Если фразу можно сказать любому блогеру, она плохая. Не пересказывай ответы, а делай вывод.`;

const IDEAS_RULES = `Как придумывать идеи роликов:
- Идея про ЭТОГО человека: с деталью из её ответов (её история, её ошибка, её цифры, её ситуация). Если идею можно отдать любому блогеру, она плохая.
- Хорошая идея = конкретная ситуация + конфликт, результат или цифра + понятно, что будет в кадре.
- Затёртые форматы НЕ предлагай в лоб: «типы людей», «ожидание vs реальность», «POV», «озвучиваю мысли собаки», «день из моей жизни», «5 фактов обо мне», «GRWM», «распаковка», «топ-5 средств». Если формат всё же нужен, дай ему свой неожиданный угол.
- Примеры плохо → хорошо:
  «5 советов по уходу за волосами» → «Я 2 года мыла голову не тем шампунем, и вот как это выглядело»
  «Ожидание и реальность: завести собаку» → «Сколько я реально потратила на шпица за первый год, по чекам»
  «Мой макияж» → «Стрелки за 2 минуты до первого урока, пока мама орёт, что мы опаздываем»
- Крючок (первая фраза или кадр) за 2 секунды обещает конкретное: результат, цифру, ошибку, узнавание. Не «Привет, сегодня расскажу…».`;

const SYSTEM_VARIANTS = `Ты опытный продюсер блогеров. Человек ответил на вопросы о себе. Найди его позиционирование и предложи 3 варианта. Используй ровно те понятия, что были на мастер-классе:

ПОНЯТИЯ МАСТЕР-КЛАССА
- Роли: ${ROLES.join(", ")}. Их можно смешивать (главная + вторая).
- Три круга: что я люблю + что я умею (опыт, через что прошла) + что интересно людям. Блог там, где все три пересекаются.
- Микрониша: сужаем тему (не «бьюти», а «уход за кудрявыми»), для кого (не «для всех», а «для школьниц»), как (не «советы», а «тестирую на себе»).
- Зонтик: одна фраза, о чём блог. Не слишком узко (это идея для одного ролика, например «лаки зелёного цвета»), а так, чтобы под ней влезло 3-5 рубрик и 50+ идей роликов.
- Рубрики: 3-5 постоянных тем под зонтиком. У каждой доля в процентах: сколько примерно роликов из 10 будет про неё (в сумме 100).
- Две формулы позиционирования:
  для эксперта (учит, помогает, даёт пользу): «Помогаю [кому] получить [результат] через [подход], без [страха]»
  для развлекающих и лайфстайла: «Снимаю [что] про [ситуацию] для тех, кто [узнаёт в этом себя]»
- Портрет аудитории: не «девочки 14-18», а живой человек: что у неё болит, чего хочет, чего стесняется, зачем подпишется.

КАК ДУМАТЬ
- Сначала найди зацепки в ответах: что спрашивают друзья (= умеет), через что прошла сама, какая подача (характер), что уже зашло. И отсеки лишнее: интересы, которые ни с чем не пересекаются, убираются. Обязательно скажи, что убрала и почему.
- Вариант 1 «Ближе к тому, что есть»: усиливаем текущий блог.
- Вариант 2 «Смежный»: соединяем её формат и подачу с тем, что она умеет или любит.
- Вариант 3 «Смелый»: заметный поворот, но только из её реальных интересов и опыта.
- Варианты заметно разные: другой зонтик или другой набор рубрик.
- Цель блога: продавать услуги → экспертная формула; охваты, реклама, кайф → можно развлекательная.
- Если ответов мало, всё равно предложи варианты, а в summary мягко скажи, что разбор будет точнее с подробными ответами.

ПРИМЕР
Ответы: «Люблю краситься, смотреть сериалы, иногда готовлю. Подруги часто спрашивают, как я делаю стрелки. Была плохая кожа, сейчас норм. Хочу, чтобы меня видели весёлой. Для кого, не знаю, наверное для всех».
Хороший разбор: зацепки: спрашивают про стрелки (умеет), была плохая кожа (прошла сама), хочет быть весёлой (подача с юмором). Сериалы и готовку убираем: не пересекаются с остальным. Аудитория: школьницы 14-17, которые учатся краситься. Зонтик: «макияж для школы и проблемной кожи, с юмором». Рубрики: стрелки и быстрый макияж в школу 40%, проблемная кожа: что помогло мне 30%, тестирую хайповую косметику 20%, смешное про макияж и учёбу 10%. Формула эксперта: «Помогаю школьницам краситься за 5 минут перед уроками и не бояться прыщей, через то, что проверила на своей коже, без дорогой косметики».
Плохой разбор: «Ты творческая личность, делись вдохновением и бьюти-контентом».

${STYLE}

Ответь ТОЛЬКО JSON-объектом, без текста до и после:
{
  "summary": "2-3 предложения: что ты видишь в ответах и в чём её сильная сторона",
  "hooks": ["зацепка 1: что увидела в ответе → что это значит", "зацепка 2", "зацепка 3"],
  "cut": "что убрала из её интересов и почему (одно предложение), или пустая строка",
  "role": {"main": "роль из списка", "second": "роль из списка или пустая строка", "why": "1-2 предложения почему"},
  "variants": [
    {
      "type": "Ближе к тому, что есть" | "Смежный" | "Смелый",
      "title": "название направления, до 6 слов",
      "umbrella": "зонтик: одна фраза, о чём блог",
      "idea": "2 предложения: как выглядит блог",
      "rubrics": [{"name": "название рубрики", "share": 40, "what": "что в ней снимать, 1 предложение"}],
      "audience": {"who": "кто она: возраст, чем занята", "pain": "что болит", "want": "чего хочет", "shy": "чего стесняется", "why_follow": "зачем подпишется"},
      "formula_kind": "expert" | "fun",
      "formula": "позиционирование по нужной формуле",
      "why_you": "почему подходит именно ей, со ссылкой на её ответы",
      "money": "как на этом зарабатывать, 1 предложение"
    }
  ],
  "tip": "одна вещь, которую стоит перестать делать или на что обратить внимание"
}
Ровно 3 варианта, порядок: Ближе к тому, что есть → Смежный → Смелый. В каждом 3-5 рубрик, доли в сумме 100.`;

const SYSTEM_PACK = `Ты опытный продюсер блогеров и упаковщик профилей. Человек выбрал направление блога. Собери под него упаковку профиля и контент по правилам мастер-класса, чтобы завтра можно было всё поставить и начать снимать.

ПРАВИЛА УПАКОВКИ (как на мастер-классе)
- Аватарка: лицо крупно, видно глаза, однотонный светлый фон. Нельзя: полный рост, очки, котик, закат, групповое фото. Если человек снимает без лица, предложи узнаваемую замену (руки, силуэт, иллюстрация) и честно скажи, что с лицом доверия больше.
- Поле «Имя»: эксперту имя + тема (и город, если услуги офлайн), например «Аня | брови Казань». Развлекательному и лайфстайл-блогу хватит имени. Нельзя: только ник, точки, подчёркивания, эмодзи вместо слов.
- Шапка ровно по шаблону, 3 строки: 1) кто ты и о чём блог; 2) что получит подписчик; 3) куда идти дальше 👇. Без цитат и наборов эмодзи. Пример юмор: «Выживаю на первом курсе 🫠 / Узнала себя? Оставайся / тт и реклама по ссылке 👇». Пример эксперт: «Брови, которые держатся 6 недель / Показываю уход дома / Запись в Telegram 👇».
- Актуальные: 3-5 штук: «обо мне», «лучшее», «отзывы» или «до/после». Нельзя: «лето 2022», «др», 15 кружков.
- Закреп 3 ролика. Юмор или лайф: самый залётный, второй по просмотрам, тот, что лучше всего показывает, какой у тебя юмор. Эксперт: кто я и чем помогаю, результат (до/после, кейс, отзыв), самый залётный полезный. Если в ответах есть ролики, которые зашли, называй их. Если блога ещё нет, предложи, какие ролики снять под закреп.
- Порядок рилсов менять не нужно: новый человек смотрит закреп и первые 6-9 роликов.

ОТСТРОЙКА (почему подпишутся именно на неё), 6 пунктов: опыт (через что прошла она и не прошли другие), характер, взгляд (с чем не согласна в нише), формат (как узнают ролик без звука), метод (свой способ делать то же самое), образ (что запомнят в одном слове).

ПРОВЕРКА ПОЗИЦИОНИРОВАНИЯ, 5 вопросов, честно ответь да/нет и коротко поясни: Понятность (незнакомый человек за 5 секунд понял, о чём блог?), Отличие (рядом с 5 похожими блогерами её отличат?), Востребованность (на эту тему есть залёты у других, её ищут?), Это ты (не стыдно и не скучно снимать это год?), Потенциал (влезает 3-5 рубрик и 50+ идей?). Если где-то «нет», в note скажи, что поправить.

КОНТЕНТ
- Рубрики: те же, что в выбранном направлении (3-5), и по 3 идеи ролика на каждую, с крючком.
- План на неделю реальный: роликов не больше, чем указано ниже. Остальные дни: сторис или отдых. Темы распределяй по долям рубрик.

${IDEAS_RULES}

${STYLE}

Ответь ТОЛЬКО JSON-объектом, без текста до и после:
{
  "name_field": "поле Имя в профиле",
  "name_note": "почему так, 1 предложение",
  "usernames": ["вариант ника 1", "вариант ника 2", "вариант ника 3"],
  "bio": "шапка по шаблону, 3 строки через \\n",
  "bio_alt": "второй вариант шапки по тому же шаблону, другой по подаче, 3 строки через \\n",
  "avatar": "какую поставить аватарку, 1-2 предложения",
  "highlights": [{"name": "название", "what": "что туда положить"}],
  "link": "что поставить по ссылке в профиле",
  "pinned": [{"title": "какой ролик закрепить", "why": "зачем"}],
  "otstroika": {"experience": "", "character": "", "view": "", "format": "", "method": "", "image": "одно слово или короткая фраза"},
  "check": [{"q": "Понятность", "ok": true, "note": "пояснение"}, {"q": "Отличие", "ok": true, "note": ""}, {"q": "Востребованность", "ok": true, "note": ""}, {"q": "Это ты", "ok": true, "note": ""}, {"q": "Потенциал", "ok": true, "note": ""}],
  "rubrics": [{"name": "рубрика", "freq": "как часто", "ideas": [{"title": "идея ролика", "hook": "первая фраза или кадр"}]}],
  "week": [{"day": "Пн", "rubric": "рубрика", "format": "рилс / сторис / отдых", "idea": "что именно"}],
  "stories": ["идея для сторис 1", "идея 2", "идея 3", "идея 4"],
  "dont": ["чего не делать 1", "2", "3"],
  "first_steps": ["что сделать сегодня 1", "2", "3"]
}
Количество: usernames 3, highlights 3-5, pinned 3, check ровно 5, rubrics 3-5 по 3 идеи, week ровно 7 дней Пн-Вс, stories 4-6, dont 3, first_steps 3.`;

function clean(s, max) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
}
function lines(s, maxLines, maxLen) {
  return String(s || "").split(/\n|\\n|\s\/\s/).map(l => clean(l, maxLen)).filter(Boolean).slice(0, maxLines).join("\n");
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

function normRubrics(list) {
  let m = arr(list, 5).map(x => ({ name: clean(x && x.name, 70), share: Math.max(0, Math.round(Number(x && (x.share != null ? x.share : x.percent)) || 0)), what: clean(x && x.what, 250) }))
    .filter(x => x.name);
  const sum = m.reduce((s, x) => s + x.share, 0);
  if (m.length && sum !== 100) {
    if (sum === 0) m.forEach(x => (x.share = Math.round(100 / m.length)));
    else m.forEach(x => (x.share = Math.round((x.share / sum) * 100)));
    m[0].share += 100 - m.reduce((s, x) => s + x.share, 0);
  }
  return m.sort((a, b) => b.share - a.share);
}

function validateVariants(d) {
  if (!d || !Array.isArray(d.variants) || !d.variants.length) return null;
  const aud = a => ({ who: clean(a && a.who, 200), pain: clean(a && a.pain, 250), want: clean(a && a.want, 250), shy: clean(a && a.shy, 250), why_follow: clean(a && a.why_follow, 250) });
  return {
    summary: clean(d.summary, 800),
    hooks: arr(d.hooks, 4).map(s => clean(s, 200)).filter(Boolean),
    cut: clean(d.cut, 300),
    role: { main: clean(d.role && d.role.main, 40), second: clean(d.role && d.role.second, 40), why: clean(d.role && d.role.why, 500) },
    variants: d.variants.slice(0, 3).map(v => ({
      type: clean(v.type, 40), title: clean(v.title, 80), umbrella: clean(v.umbrella, 200), idea: clean(v.idea, 500),
      rubrics: normRubrics(v.rubrics || v.mix), audience: aud(v.audience),
      formula_kind: v.formula_kind === "expert" ? "expert" : "fun", formula: clean(v.formula, 400),
      why_you: clean(v.why_you, 500), money: clean(v.money, 300),
    })).filter(v => v.title && v.rubrics.length),
    tip: clean(d.tip, 400),
  };
}

function validatePack(d) {
  if (!d || typeof d !== "object" || !d.bio) return null;
  const o = (x, keys) => { const r = {}; keys.forEach(([k, n]) => (r[k] = clean(x && x[k], n))); return r; };
  const ot = d.otstroika || {};
  return {
    name_field: clean(d.name_field, 64),
    name_note: clean(d.name_note, 250),
    usernames: arr(d.usernames, 4).map(s => clean(s, 40)).filter(Boolean),
    bio: lines(d.bio, 4, 80),
    bio_alt: lines(d.bio_alt, 4, 80),
    avatar: clean(d.avatar, 300),
    highlights: arr(d.highlights, 5).map(x => o(x, [["name", 20], ["what", 200]])).filter(x => x.name),
    link: clean(d.link, 300),
    pinned: arr(d.pinned, 3).map(x => o(x, [["title", 160], ["why", 200]])).filter(x => x.title),
    otstroika: o(ot, [["experience", 250], ["character", 200], ["view", 250], ["format", 250], ["method", 250], ["image", 80]]),
    check: arr(d.check, 5).map(x => ({ q: clean(x && x.q, 40), ok: !!(x && x.ok), note: clean(x && x.note, 250) })).filter(x => x.q),
    rubrics: arr(d.rubrics, 5).map(r => ({ name: clean(r && r.name, 70), freq: clean(r && r.freq, 60), ideas: arr(r && r.ideas, 3).map(x => o(x, [["title", 160], ["hook", 200]])).filter(x => x.title) })).filter(r => r.name),
    week: arr(d.week, 7).map(x => o(x, [["day", 4], ["rubric", 70], ["format", 40], ["idea", 250]])).filter(x => x.day),
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
  const about = "Ответы человека:\n" + Object.entries(FIELDS).map(([k, l]) => `${l}: ${clean(answers[k], 800) || "(не ответила)"}`).join("\n");

  try {
    if (body.mode === "pack") {
      const v = body.variant || {};
      const rubrics = (Array.isArray(v.rubrics) ? v.rubrics : []).slice(0, 5).map(m => `${clean(m.share, 4)}% ${clean(m.name, 70)} (${clean(m.what, 200)})`).join("; ");
      if (!clean(v.title, 10) || !rubrics) return res.status(400).json({ error: "no_variant" });
      const role = body.role || {};
      const a = v.audience || {};
      const p = pace(answers.time);
      const user = `${about}\n\nВыбранное направление: ${clean(v.title, 80)}\nЗонтик: ${clean(v.umbrella, 200)}\nСуть: ${clean(v.idea, 500)}\nРубрики: ${rubrics}\n` +
        `Аудитория: ${clean(a.who, 200)}; болит: ${clean(a.pain, 250)}; хочет: ${clean(a.want, 250)}; стесняется: ${clean(a.shy, 250)}; зачем подпишется: ${clean(a.why_follow, 250)}\n` +
        `Формула (${v.formula_kind === "expert" ? "эксперт" : "развлекательная"}): ${clean(v.formula, 400)}\n` +
        `Роль: ${clean(role.main, 40)}${role.second ? " + " + clean(role.second, 40) : ""}\n\n` +
        `Время на блог: ${clean(answers.time, 60) || "не указала"}. Роликов в неделю: максимум ${p.videos}. Ритм: ${p.text}.`;
      const text = await ask(SYSTEM_PACK, user, 0.8, 4000, process.env.LLM_MODEL_PACK || "gpt-4o");
      const result = validatePack(parseJSON(text));
      if (!result) { console.error("Bad pack JSON", text.slice(0, 500)); return res.status(502).json({ error: "bad_json" }); }
      result.pace = p.text;
      await notify(`✅ ${clean(answers.name, 40) || "Участница"}${contact ? " (" + contact + ")" : ""} выбрала: ${clean(v.title, 80)}\nЗонтик: ${clean(v.umbrella, 200)}\nРубрики: ${rubrics}`);
      return res.status(200).json(result);
    }

    const avoid = Array.isArray(body.avoid) ? body.avoid.map(t => clean(t, 80)).filter(Boolean).slice(0, 6) : [];
    let user = about;
    if (avoid.length) user += `\n\nЭти направления ей уже предлагали, придумай другие: ${avoid.join("; ")}`;
    const text = await ask(SYSTEM_VARIANTS, user, avoid.length ? 1 : 0.8, 3000, process.env.LLM_MODEL || "gpt-4o-mini");
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
