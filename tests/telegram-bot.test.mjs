import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { buildPoll, parseCommand, romeToday, webhookSecret, SKIP_OPTION } from '../telegram-bot/worker.js';

// Domenica 18 ottobre 2026, ore 21 a Roma
const SUNDAY = new Date('2026-10-18T19:00:00Z');
const ENV = { TELEGRAM_BOT_TOKEN: '123:abc' };

test('propone le sere dei 7 giorni successivi', () => {
  assert.deepEqual(buildPoll(SUNDAY).options, [
    'Lunedì 19 ottobre', 'Martedì 20 ottobre', 'Mercoledì 21 ottobre', 'Giovedì 22 ottobre',
    'Venerdì 23 ottobre', 'Sabato 24 ottobre', 'Domenica 25 ottobre', SKIP_OPTION,
  ]);
});

test('lettura del comando: sere, orario, menzione del bot', () => {
  const c = parseCommand('/sondaggio@NostromoBot mar, giovedì 22.00');
  assert.equal(c.name, 'sondaggio');
  assert.deepEqual([...c.days].sort(), [2, 4]);
  assert.equal(c.time, '22:00');
  assert.equal(parseCommand('ciao a tutti'), null);
  assert.deepEqual(buildPoll(SUNDAY, { days: c.days, time: c.time }).options, ['Martedì 20 ottobre', 'Giovedì 22 ottobre', SKIP_OPTION]);
});

test('domanda entro i limiti di Telegram', () => {
  const { question, options } = buildPoll(SUNDAY, { time: '22:00', game: 'Sea of Thieves' });
  assert.match(question, /Sea of Thieves alle 22:00/);
  assert.ok(question.length <= 300 && options.length <= 10 && options.every((o) => o.length <= 100));
});

test('la data è quella di Roma', () => {
  assert.equal(romeToday(new Date('2026-10-17T23:30:00Z')).toISOString().slice(0, 10), '2026-10-18');
});

function mockTelegram() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = url.split('/').pop();
    calls.push({ method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }));
  };
  return calls;
}

const webhook = async (text, secret) => new Request('https://bot.example.workers.dev/webhook', {
  method: 'POST',
  headers: { 'X-Telegram-Bot-Api-Secret-Token': secret ?? await webhookSecret(ENV.TELEGRAM_BOT_TOKEN) },
  body: JSON.stringify({ message: { text, chat: { id: -100123 } } }),
});

test('/sondaggio nel gruppo crea il sondaggio non anonimo a scelta multipla e lo fissa', async () => {
  const calls = mockTelegram();
  const res = await worker.fetch(await webhook('/sondaggio'), ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.method), ['sendPoll', 'pinChatMessage']);
  const poll = calls[0].body;
  assert.equal(poll.chat_id, -100123);
  assert.equal(poll.is_anonymous, false);
  assert.equal(poll.allows_multiple_answers, true);
  assert.equal(poll.options.at(-1).text, SKIP_OPTION);
  assert.equal(calls[1].body.message_id, 42);
});

test('i messaggi normali vengono ignorati', async () => {
  const calls = mockTelegram();
  await worker.fetch(await webhook('stasera ci sono!'), ENV);
  assert.equal(calls.length, 0);
});

test('chi non conosce il codice segreto viene respinto', async () => {
  const calls = mockTelegram();
  const res = await worker.fetch(await webhook('/sondaggio', 'sbagliato'), ENV);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('/setup collega il webhook con il codice segreto', async () => {
  const calls = mockTelegram();
  const res = await worker.fetch(new Request('https://bot.example.workers.dev/setup'), ENV);
  assert.match(await res.text(), /Bot collegato/);
  assert.equal(calls[0].method, 'setWebhook');
  assert.equal(calls[0].body.url, 'https://bot.example.workers.dev/webhook');
  assert.equal(calls[0].body.secret_token, await webhookSecret(ENV.TELEGRAM_BOT_TOKEN));
});
