#!/usr/bin/env node
/*
 * Pubblica nel gruppo Telegram il sondaggio "in quali sere ci sei questa settimana?".
 * Lo lancia GitHub Actions ogni domenica sera (.github/workflows/telegram-poll.yml).
 *
 * Variabili d'ambiente:
 *  TELEGRAM_BOT_TOKEN  token del bot avuto da @BotFather (obbligatorio, come segreto)
 *  TELEGRAM_CHAT_ID    id del gruppo; se manca, lo script cerca il gruppo in cui il bot è stato aggiunto
 *  SERATE              sere da proporre, es. "lun,mer,gio,ven" (predefinito: tutte)
 *  ORARIO              orario della serata (predefinito 21:30)
 *  GIOCO               nome del gioco (predefinito Sea of Thieves)
 */
import { pathToFileURL } from 'node:url';

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAY_CODES = { dom: 0, lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6 };
export const SKIP_OPTION = '❌ Questa settimana salto';

// Data di oggi a Roma (a mezzogiorno UTC, così aggiungere giorni non risente dell'ora legale)
export function romeToday(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T12:00:00Z`);
}

export function parseDays(spec) {
  const codes = String(spec || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const days = codes.map((c) => DAY_CODES[c.slice(0, 3)]).filter((d) => d !== undefined);
  return days.length ? new Set(days) : new Set([0, 1, 2, 3, 4, 5, 6]);
}

// Sondaggio per i 7 giorni successivi a oggi (la domenica sera: da lunedì a domenica prossima)
export function buildPoll(now = new Date(), { days, time, game } = {}) {
  const wanted = parseDays(days);
  const today = romeToday(now);
  const options = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    if (!wanted.has(d.getUTCDay())) continue;
    const name = WEEKDAYS[d.getUTCDay()];
    options.push(`${name[0].toUpperCase()}${name.slice(1)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`);
  }
  options.push(SKIP_OPTION);
  const question = `🏴‍☠️ ${game || 'Sea of Thieves'} alle ${time || '21:30'}: in quali sere ci sei questa settimana? Puoi scegliere più sere.`;
  return { question, options };
}

async function api(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

// Trova il gruppo in cui il bot è stato aggiunto (Telegram conserva gli eventi delle ultime 24 ore)
async function findGroup(token) {
  const data = await api(token, 'getUpdates', { allowed_updates: ['message', 'my_chat_member'] });
  const chats = new Map();
  for (const u of data.result || []) {
    const chat = (u.my_chat_member || u.message || {}).chat;
    if (chat && (chat.type === 'group' || chat.type === 'supergroup')) chats.set(chat.id, chat.title);
  }
  return [...chats.entries()].pop();
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Manca il segreto TELEGRAM_BOT_TOKEN: aggiungilo in Settings → Secrets and variables → Actions.');
    process.exit(1);
  }
  let chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    const found = await findGroup(token);
    if (!found) {
      console.error('Non trovo il gruppo. Aggiungi il bot al gruppo Telegram, scrivi un messaggio nel gruppo e rilancia entro 24 ore.');
      process.exit(1);
    }
    [chatId] = found;
    console.log(`Gruppo trovato: "${found[1]}". Per non doverlo più cercare, salva la variabile TELEGRAM_CHAT_ID = ${chatId}`);
  }

  const { question, options } = buildPoll(new Date(), { days: process.env.SERATE, time: process.env.ORARIO, game: process.env.GIOCO });
  const send = (id) => api(token, 'sendPoll', {
    chat_id: id,
    question,
    options: options.map((text) => ({ text })),
    is_anonymous: false,
    allows_multiple_answers: true,
  });

  let res = await send(chatId);
  // Se il gruppo è diventato "supergruppo" Telegram cambia id e ci dice quello nuovo
  const migrated = res.parameters && res.parameters.migrate_to_chat_id;
  if (!res.ok && migrated) {
    console.log(`Il gruppo ha cambiato id: aggiorna TELEGRAM_CHAT_ID a ${migrated}`);
    chatId = migrated;
    res = await send(chatId);
  }
  if (!res.ok) {
    console.error(`Telegram ha rifiutato il sondaggio: ${res.description}`);
    process.exit(1);
  }
  console.log(`Sondaggio pubblicato con ${options.length} risposte.`);

  // Fissa il sondaggio in alto: funziona solo se il bot è amministratore, altrimenti pazienza
  const pin = await api(token, 'pinChatMessage', { chat_id: chatId, message_id: res.result.message_id });
  if (!pin.ok) console.log('Sondaggio non fissato in alto (serve che il bot sia amministratore del gruppo).');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
