/*
 * Calcolo della compatibilità gioco <-> gruppo.
 *
 * Ogni giocatore dà un punteggio 0-100 al gioco in base a gusti, stile, budget e voto esplicito.
 * Il punteggio di gruppo mescola media e punteggio minimo ("nessuno deve annoiarsi"):
 * un gioco amato da 4 e odiato da 1 scende sotto uno che piace abbastanza a tutti.
 */
(function (root) {
  const VOTES = {
    love: { label: 'Lo voglio!', icon: '❤️', bonus: 25 },
    yes: { label: 'Ci sto', icon: '👍', bonus: 10 },
    meh: { label: 'Boh', icon: '🤷', bonus: 0 },
    no: { label: 'Preferirei di no', icon: '👎', bonus: -30 },
    veto: { label: 'Mai!', icon: '🚫', bonus: 0 },
  };

  const PRICE_TIERS = ['Gratis', 'Fino a 15€', 'Fino a 30€', 'Fino a 50€', 'Oltre 50€'];

  function priceTierFromCents(cents) {
    if (!cents) return 0;
    if (cents <= 1500) return 1;
    if (cents <= 3000) return 2;
    if (cents <= 5000) return 3;
    return 4;
  }

  // Prezzo effettivo per un giocatore: 0 se ce l'ha già o se il suo Game Pass lo copre.
  function effectiveTier(game, player, tier) {
    if ((player.owned || []).includes(game.id)) return { tier: 0, why: 'ce l\'ha già' };
    if (game.gamePass && tier > 0) {
      const gp = player.gamePass;
      if (gp === 'ultimate' || (gp === 'pc' && player.platform === 'pc')) {
        return { tier: 0, why: 'incluso nel suo Game Pass' };
      }
    }
    return { tier, why: null };
  }

  function genreAffinity(game, player) {
    const prefs = player.genres || {};
    const vals = game.genres.map((g) => (prefs[g] === undefined ? 1 : prefs[g]));
    if (!vals.length) return 1 / 3;
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return (0.6 * max + 0.4 * avg) / 3;
  }

  function playerScore(game, player, opts = {}) {
    const vote = (player.votes || {})[game.id];
    const reasons = [];
    if (vote === 'veto') return { score: 0, veto: true, reasons: ['ha messo il veto'] };

    const genre = genreAffinity(game, player);
    const style = 1 - Math.abs((player.style ?? 50) / 100 - game.competitive);
    let score = 100 * (0.55 * genre + 0.25 * style + 0.2);

    if (genre >= 0.85) reasons.push('adora il genere');
    else if (genre <= 0.25) reasons.push('il genere non gli piace');
    if (style < 0.5) reasons.push(game.competitive > 0.5 ? 'troppo competitivo per lui' : 'preferisce sfidarsi');

    const overCx = game.complexity - (player.maxComplexity ?? 2);
    if (overCx > 0) { score -= 15 * overCx; reasons.push('troppo complicato'); }
    const overRf = game.reflexes - (player.reflexes ?? 2);
    if (overRf > 0) { score -= 15 * overRf; reasons.push('servono troppi riflessi'); }
    const sessionGap = Math.abs(game.session - (player.session ?? 2));
    score -= 6 * sessionGap;

    const eff = effectiveTier(game, player, opts.tier ?? game.priceTier);
    if (eff.why) reasons.push(eff.why);
    if (eff.tier > (player.budget ?? 2)) {
      score -= 12 * (eff.tier - (player.budget ?? 2));
      reasons.push('fuori budget');
    }

    if (vote && VOTES[vote]) {
      score += VOTES[vote].bonus;
      reasons.push(`voto: ${VOTES[vote].icon} ${VOTES[vote].label}`);
    }

    return { score: Math.round(Math.max(0, Math.min(100, score))), veto: false, reasons, vote, cost: eff.tier };
  }

  /*
   * Classifica i giochi per il gruppo.
   * opts.allowSplit: tieni anche i giochi dove non ci state tutti insieme (con penalità)
   * opts.recent: id dei giochi giocati di recente (leggera penalità per variare)
   * opts.steam: dati live da Steam ({ [appid]: { price, ... } }) per aggiornare la fascia di prezzo
   */
  function rankGames(games, players, opts = {}) {
    const active = players.filter((p) => p.active !== false);
    const size = active.length;
    const platforms = new Set(active.map((p) => p.platform));
    const ranked = [];
    const excluded = [];

    for (const game of games) {
      const live = opts.steam && game.appid ? opts.steam[game.appid] : null;
      const tier = live && live.isFree ? 0 : live && live.price ? priceTierFromCents(live.price.initial) : game.priceTier;

      if (platforms.size > 1 && game.crossplayPcXbox === false) {
        excluded.push({ game, why: 'niente cross-play PC/Xbox' });
        continue;
      }
      const per = active.map((p) => ({ player: p, ...playerScore(game, p, { tier }) }));
      const vetoes = per.filter((r) => r.veto).map((r) => r.player.name);
      if (vetoes.length) {
        excluded.push({ game, why: `veto di ${vetoes.join(', ')}` });
        continue;
      }
      const fits = size <= game.maxParty;
      if (!fits && !opts.allowSplit) {
        excluded.push({ game, why: `massimo ${game.maxParty} giocatori insieme` });
        continue;
      }
      if (!size) {
        ranked.push({ game, score: 0, per, fits, tier });
        continue;
      }
      const scores = per.map((r) => r.score);
      const mean = scores.reduce((a, b) => a + b, 0) / size;
      const min = Math.min(...scores);
      let score = 0.6 * mean + 0.4 * min;
      const notes = [];
      if (!fits) { score -= 15; notes.push(`in ${size} dovete dividervi (max ${game.maxParty})`); }
      if (size === game.maxParty) notes.push(`numero perfetto: esattamente ${size}`);
      if ((opts.recent || []).includes(game.id)) { score -= 5; notes.push('giocato di recente'); }
      const loves = per.filter((r) => r.vote === 'love').length;
      if (loves >= 2) notes.push(`${loves} lo vogliono`);
      const free = per.filter((r) => r.cost === 0).length;
      if (free === size) notes.push('non costa nulla a nessuno');

      ranked.push({ game, score: Math.round(Math.max(0, score)), mean: Math.round(mean), min, per, fits, tier, notes });
    }

    ranked.sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name));
    return { ranked, excluded };
  }

  const api = { VOTES, PRICE_TIERS, priceTierFromCents, effectiveTier, genreAffinity, playerScore, rankGames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
