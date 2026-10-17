const test = require('node:test');
const assert = require('node:assert/strict');
const { GAMES, GENRES } = require('../js/games.js');
const S = require('../js/scoring.js');

const base = (over = {}) => ({
  id: 'p', name: 'P', active: true, platform: 'pc', gamePass: 'none', budget: 2,
  genres: {}, style: 30, maxComplexity: 2, reflexes: 2, session: 2, votes: {}, owned: [], ...over,
});
const five = (over = {}) => Array.from({ length: 5 }, (_, i) => base({ id: 'p' + i, name: 'P' + i, ...over }));

test('il catalogo è coerente', () => {
  const ids = new Set();
  for (const g of GAMES) {
    assert.ok(!ids.has(g.id), `id duplicato ${g.id}`);
    ids.add(g.id);
    assert.ok(g.genres.length, g.id);
    for (const x of g.genres) assert.ok(GENRES[x], `genere sconosciuto ${x} in ${g.id}`);
    assert.ok([0, 1, 2, 3, 4].includes(g.priceTier), g.id);
    assert.ok(g.maxParty >= 2, g.id);
    for (const k of ['complexity', 'reflexes', 'session']) assert.ok([1, 2, 3].includes(g[k]), `${k} in ${g.id}`);
    assert.ok(g.competitive >= 0 && g.competitive <= 1, g.id);
    assert.ok(['steam', 'epic', 'msstore', 'battlenet'].includes(g.store), g.id);
  }
});

test('il veto esclude il gioco', () => {
  const players = five();
  players[2].votes = { valheim: 'veto' };
  const { ranked, excluded } = S.rankGames(GAMES, players);
  assert.ok(!ranked.some((r) => r.game.id === 'valheim'));
  assert.match(excluded.find((e) => e.game.id === 'valheim').why, /veto di P2/);
});

test('giochi troppo piccoli per il gruppo esclusi, o penalizzati se allowSplit', () => {
  const sot = GAMES.find((g) => g.id === 'sea-of-thieves');
  assert.equal(S.rankGames([sot], five()).ranked.length, 0);
  const r = S.rankGames([sot], five(), { allowSplit: true }).ranked[0];
  assert.equal(r.fits, false);
  assert.ok(r.notes.some((n) => /dividervi/.test(n)));
});

test('il Game Pass azzera il costo solo sulla piattaforma giusta', () => {
  const g = { id: 'x', gamePass: true };
  assert.equal(S.effectiveTier(g, base({ gamePass: 'pc', platform: 'pc' }), 3).tier, 0);
  assert.equal(S.effectiveTier(g, base({ gamePass: 'pc', platform: 'xbox' }), 3).tier, 3);
  assert.equal(S.effectiveTier(g, base({ gamePass: 'ultimate', platform: 'xbox' }), 3).tier, 0);
  assert.equal(S.effectiveTier({ id: 'x', gamePass: false }, base({ owned: ['x'] }), 3).tier, 0);
});

test('i gusti spostano la classifica', () => {
  const lovers = five({ genres: { strategy: 3, shooter: 0 }, maxComplexity: 3, reflexes: 1, style: 50 });
  const top = S.rankGames(GAMES, lovers).ranked.slice(0, 3).map((r) => r.game.genres);
  assert.ok(top.every((g) => g.includes('strategy')), JSON.stringify(top));
});

test('chi odia un gioco pesa più della media (least misery)', () => {
  const g = GAMES.find((x) => x.id === 'valheim');
  const happy = five();
  const split = five();
  split[0].votes = { valheim: 'no' };
  const a = S.rankGames([g], happy).ranked[0].score;
  const b = S.rankGames([g], split).ranked[0].score;
  assert.ok(a - b > 30 * 0.2, `${a} vs ${b}`);
});

test('fascia di prezzo dai centesimi Steam', () => {
  assert.equal(S.priceTierFromCents(0), 0);
  assert.equal(S.priceTierFromCents(1499), 1);
  assert.equal(S.priceTierFromCents(1999), 2);
  assert.equal(S.priceTierFromCents(3999), 3);
  assert.equal(S.priceTierFromCents(6999), 4);
});

test('i giochi custom senza cross-play sono esclusi se il gruppo è misto', () => {
  const g = { ...GAMES[0], id: 'c', crossplayPcXbox: false };
  const players = five();
  players[4].platform = 'xbox';
  assert.equal(S.rankGames([g], players).ranked.length, 0);
  assert.equal(S.rankGames([g], five()).ranked.length, 1);
});
