/*
 * Bot Telegram della Ciurma degli Attempatoni (Cloudflare Worker).
 *
 * Nel gruppo:  /sondaggio              -> sondaggio con le sere dei prossimi 7 giorni
 *              /sondaggio mar gio ven  -> solo quelle sere
 *              /sondaggio 22:00        -> con un orario diverso
 *
 * Variabili del Worker (Settings -> Variables and Secrets):
 *  TELEGRAM_BOT_TOKEN  (Secret, obbligatoria) token avuto da @BotFather
 *  ORARIO              (facoltativa) orario della serata, predefinito 21:30
 *  GIOCO               (facoltativa) nome del gioco, predefinito Sea of Thieves
 *
 * Dopo il deploy aprite https://<nome-worker>.<account>.workers.dev/setup per collegarlo a Telegram.
 */

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAY_CODES = { dom: 0, lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6 };
export const SKIP_OPTION = '❌ Questa settimana salto';

const HELP = [
  '🏴‍☠️ Comandi della ciurma:',
  '/sondaggio – chi c\'è e in quali sere dei prossimi 7 giorni',
  '/sondaggio mar gio ven – solo quelle sere',
  '/sondaggio 22:00 – con un orario diverso',
].join('\n');

// Data di oggi a Roma (a mezzogiorno UTC, così aggiungere giorni non risente dell'ora legale)
export function romeToday(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T12:00:00Z`);
}

// "/sondaggio@NomeBot mar gio 22:00" -> { name: 'sondaggio', days: Set{2,4}, time: '22:00' }
export function parseCommand(text) {
  const m = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(String(text || '').trim());
  if (!m) return null;
  const days = new Set();
  let time = null;
  for (const word of (m[2] || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
    const t = /^(\d{1,2})[:.](\d{2})$/.exec(word);
    if (t) time = `${t[1].padStart(2, '0')}:${t[2]}`;
    else if (DAY_CODES[word.slice(0, 3)] !== undefined) days.add(DAY_CODES[word.slice(0, 3)]);
  }
  return { name: m[1].toLowerCase(), days, time };
}

// Sondaggio con le sere dei 7 giorni dopo oggi (lanciato la domenica: da lunedì a domenica prossima)
export function buildPoll(now = new Date(), { days, time, game } = {}) {
  const wanted = days && days.size ? days : new Set([0, 1, 2, 3, 4, 5, 6]);
  const today = romeToday(now);
  const options = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    if (!wanted.has(d.getUTCDay())) continue;
    const name = WEEKDAYS[d.getUTCDay()];
    options.push(`${name[0].toUpperCase()}${name.slice(1)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`);
  }
  options.push(SKIP_OPTION);
  const question = `🏴‍☠️ ${game || 'Sea of Thieves'} alle ${time || '21:30'}: in quali sere ci sei? Puoi scegliere più sere.`;
  return { question, options };
}

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Codice segreto che Telegram rimanda a ogni messaggio: così solo Telegram può parlare col bot
export async function webhookSecret(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ciurma:${token}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const text = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

async function setup(request, env) {
  const origin = new URL(request.url).origin;
  const hook = await tg(env, 'setWebhook', {
    url: `${origin}/webhook`,
    secret_token: await webhookSecret(env.TELEGRAM_BOT_TOKEN),
    allowed_updates: ['message'],
  });
  if (!hook.ok) return text(`Telegram ha risposto: ${hook.description}\nControlla il token in TELEGRAM_BOT_TOKEN.`, 500);
  await tg(env, 'setMyCommands', {
    commands: [
      { command: 'sondaggio', description: 'Chi c\'è e in quali sere dei prossimi 7 giorni' },
      { command: 'aiuto', description: 'Come si usa il bot' },
    ],
  });
  return text('✅ Bot collegato a Telegram! Aggiungilo al gruppo e scrivi /sondaggio');
}

async function onMessage(msg, env) {
  const cmd = parseCommand(msg.text);
  if (!cmd) return;
  const chatId = msg.chat.id;
  if (cmd.name === 'sondaggio') {
    const { question, options } = buildPoll(new Date(), { days: cmd.days, time: cmd.time || env.ORARIO, game: env.GIOCO });
    const poll = await tg(env, 'sendPoll', {
      chat_id: chatId,
      question,
      options: options.map((o) => ({ text: o })),
      is_anonymous: false,
      allows_multiple_answers: true,
    });
    // Fissa il sondaggio in alto: funziona solo se il bot è amministratore del gruppo
    if (poll.ok) await tg(env, 'pinChatMessage', { chat_id: chatId, message_id: poll.result.message_id });
    else await tg(env, 'sendMessage', { chat_id: chatId, text: `Non riesco a creare il sondaggio: ${poll.description}` });
  } else if (cmd.name === 'aiuto' || cmd.name === 'start') {
    await tg(env, 'sendMessage', { chat_id: chatId, text: HELP });
  }
}

export default {
  async fetch(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN) return text('Manca la variabile segreta TELEGRAM_BOT_TOKEN nelle impostazioni del Worker.', 500);
    const { pathname } = new URL(request.url);
    if (pathname === '/setup') return setup(request, env);
    if (pathname === '/webhook' && request.method === 'POST') {
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env.TELEGRAM_BOT_TOKEN)) {
        return text('Accesso negato', 403);
      }
      const update = await request.json();
      // Si risponde sempre 200, altrimenti Telegram rimanderebbe lo stesso messaggio
      if (update.message) await onMessage(update.message, env).catch(() => {});
      return text('ok');
    }
    return text('Bot della Ciurma degli Attempatoni. Apri /setup per collegarlo a Telegram.');
  },
};
