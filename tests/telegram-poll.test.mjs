import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPoll, parseDays, romeToday, SKIP_OPTION } from '../scripts/telegram-poll.mjs';

// Domenica 18 ottobre 2026, ore 20:17 a Roma (18:17 UTC, ora legale)
const SUNDAY_EVENING = new Date('2026-10-18T18:17:00Z');

test('la domenica sera propone da lunedì a domenica prossima', () => {
  const { options } = buildPoll(SUNDAY_EVENING);
  assert.deepEqual(options, [
    'Lunedì 19 ottobre', 'Martedì 20 ottobre', 'Mercoledì 21 ottobre', 'Giovedì 22 ottobre',
    'Venerdì 23 ottobre', 'Sabato 24 ottobre', 'Domenica 25 ottobre', SKIP_OPTION,
  ]);
});

test('si possono limitare le sere', () => {
  const { options } = buildPoll(SUNDAY_EVENING, { days: 'mar, gio,ven' });
  assert.deepEqual(options, ['Martedì 20 ottobre', 'Giovedì 22 ottobre', 'Venerdì 23 ottobre', SKIP_OPTION]);
});

test('la data è quella di Roma anche a cavallo della mezzanotte UTC', () => {
  // 23:30 UTC di sabato = 01:30 di domenica a Roma
  assert.equal(romeToday(new Date('2026-10-17T23:30:00Z')).toISOString().slice(0, 10), '2026-10-18');
});

test('sere non valide: si torna a tutta la settimana', () => {
  assert.equal(parseDays('boh').size, 7);
  assert.equal(parseDays('').size, 7);
});

test('domanda con gioco e orario, entro i limiti di Telegram', () => {
  const { question, options } = buildPoll(SUNDAY_EVENING, { time: '22:00' });
  assert.match(question, /Sea of Thieves alle 22:00/);
  assert.ok(question.length <= 300);
  assert.ok(options.length <= 10 && options.every((o) => o.length <= 100));
});
