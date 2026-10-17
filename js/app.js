/* global GAMES, GENRES, STEAM_DATA, Scoring */
(function () {
  'use strict';

  const STORAGE_KEY = 'attempatoni:v1';
  const ME_KEY = 'attempatoni:me';
  const TAB_KEY = 'attempatoni:tab';
  const EMOJIS = ['🧔', '👴', '🧓', '👨‍🦲', '🧑‍🦳', '🦉', '🐻', '🦊', '🐢', '🍷', '🍺', '🎸'];
  const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const MAX_PLAYERS = 8;
  const steam = window.STEAM_DATA || { apps: {}, resolved: {}, candidates: [] };

  // ---------- utilità ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch { /* storage non disponibile */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* idem */ } },
  };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- stato ----------
  function defaultPlayer(i) {
    return {
      id: uid(),
      name: `Attempatone ${i + 1}`,
      emoji: EMOJIS[i % EMOJIS.length],
      active: true,
      platform: i < 3 ? 'pc' : 'xbox',
      gamePass: 'none',
      budget: 2,
      genres: {},
      style: 30,
      maxComplexity: 2,
      reflexes: 2,
      session: 2,
      votes: {},
      owned: [],
      updatedAt: 0,
    };
  }

  function defaultState() {
    return {
      v: 1,
      groupName: 'Serata Attempatoni',
      players: Array.from({ length: 5 }, (_, i) => defaultPlayer(i)),
      removed: [],
      custom: [],
      settings: { allowSplit: false },
      night: { gameId: null, day: 4, time: '21:30', history: [], updatedAt: 0 },
    };
  }

  function loadState() {
    try {
      const raw = store.get(STORAGE_KEY);
      if (raw) return { ...defaultState(), ...JSON.parse(raw) };
    } catch { /* stato corrotto: si riparte */ }
    return defaultState();
  }

  let state = loadState();
  let me = store.get(ME_KEY);
  let tab = store.get(TAB_KEY) || 'gruppo';
  const ui = { search: '', genre: '', onlyFit: false, onlyFree: false, toVote: false };

  function save() { store.set(STORAGE_KEY, JSON.stringify(state)); }
  const player = (id) => state.players.find((p) => p.id === id);
  function touch(p) { p.updatedAt = Date.now(); save(); }

  // ---------- giochi ----------
  function allGames() {
    return [...GAMES, ...state.custom].map((g) => ({
      ...g,
      appid: g.appid || (steam.resolved || {})[g.id] || null,
    }));
  }
  const gameById = (id) => allGames().find((g) => g.id === id);
  const steamInfo = (g) => (g.appid ? (steam.apps || {})[g.appid] : null);

  function storeUrl(g) {
    if (g.appid) return `https://store.steampowered.com/app/${g.appid}/`;
    if (g.storeUrl) return g.storeUrl;
    return `https://store.steampowered.com/search/?term=${encodeURIComponent(g.name)}`;
  }

  function imageHtml(g, extra = '') {
    const info = steamInfo(g);
    const src = (info && info.headerImage) || (g.appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg` : g.image);
    const fallback = `<span>${esc(g.name)}</span>`;
    const img = src
      ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:this.dataset.name}))" data-name="${esc(g.name)}">`
      : fallback;
    return `<div class="game-img">${img}${extra}</div>`;
  }

  function priceBadges(g) {
    const info = steamInfo(g);
    const out = [];
    if (info && info.isFree) out.push('<span class="badge good">Gratis</span>');
    else if (info && info.price) {
      out.push(`<span class="badge">${esc(info.price.formatted)}</span>`);
      if (info.price.discount) out.push(`<span class="badge sale">-${info.price.discount}%</span>`);
    } else out.push(`<span class="badge ${g.priceTier === 0 ? 'good' : ''}">${Scoring.PRICE_TIERS[g.priceTier]}</span>`);
    if (g.gamePass) out.push('<span class="badge good" title="Il catalogo Game Pass cambia: verificate">Game Pass</span>');
    return out.join('');
  }

  function gameBadges(g) {
    const size = activePlayers().length;
    const fit = size <= g.maxParty;
    const info = steamInfo(g);
    const b = [priceBadges(g)];
    b.push(`<span class="badge ${fit ? 'good' : 'warn'}">👥 max ${g.maxParty} insieme</span>`);
    if (g.store !== 'steam') b.push(`<span class="badge">${{ epic: 'Epic Games', msstore: 'Microsoft Store', battlenet: 'Battle.net' }[g.store] || esc(g.store)}</span>`);
    if (info && info.reviews) b.push(`<span class="badge" title="${esc(info.reviews.desc)} su ${info.reviews.total} recensioni Steam">👍 ${info.reviews.pct}%</span>`);
    b.push(`<span class="badge">${['', 'Facile', 'Medio', 'Impegnativo'][g.complexity]}</span>`);
    if (g.reflexes === 1) b.push('<span class="badge good">Pochi riflessi</span>');
    if (g.reflexes === 3) b.push('<span class="badge warn">Riflessi pronti</span>');
    if (g.custom) b.push('<span class="badge warn">Aggiunto da voi</span>');
    return b.join('');
  }

  function gameDetails(g) {
    const info = steamInfo(g);
    return `<details><summary>Cross-play e dettagli</summary>
      <p>🔀 ${esc(g.crossplay || 'Cross-play PC/Xbox')}</p>
      ${g.partyNote ? `<p>👥 ${esc(g.partyNote)}</p>` : ''}
      ${g.accounts ? `<p>🔑 ${esc(g.accounts)}</p>` : ''}
      <p>🏷️ ${g.genres.map((x) => esc(GENRES[x] || x)).join(', ')}</p>
      ${info && info.shortDescription ? `<p class="muted">${esc(info.shortDescription)}</p>` : ''}
      <p><a href="${esc(storeUrl(g))}" target="_blank" rel="noopener">Pagina dello store ↗</a></p>
    </details>`;
  }

  // ---------- giocatori ----------
  const activePlayers = () => state.players.filter((p) => p.active !== false);

  function recentIds() {
    return state.night.history.slice(-2).map((h) => h.gameId);
  }

  function ranking() {
    return Scoring.rankGames(allGames(), state.players, {
      allowSplit: state.settings.allowSplit,
      recent: recentIds(),
      steam: steam.apps,
    });
  }

  // ---------- render ----------
  function render() {
    document.title = state.groupName;
    $('#group-title').textContent = state.groupName;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));

    const sel = $('#whoami');
    sel.innerHTML = `<option value="">— scegli —</option>` +
      state.players.map((p) => `<option value="${p.id}" ${p.id === me ? 'selected' : ''}>${p.emoji} ${esc(p.name)}</option>`).join('');

    renderBanner();
    const views = { gruppo: viewGroup, catalogo: viewCatalog, consigli: viewResults, serata: viewNight, condividi: viewShare };
    $('#view').innerHTML = (views[tab] || viewGroup)();

    $('#steam-status').textContent = steam.updatedAt
      ? `Dati Steam aggiornati il ${new Date(steam.updatedAt).toLocaleDateString('it-IT')}`
      : 'Prezzi indicativi (dati Steam live non ancora scaricati)';
  }

  function renderBanner() {
    const el = $('#banner');
    if (pendingImport) {
      el.innerHTML = `<div class="banner"><div class="card">
        <span>📬 Hai aperto un link del gruppo <b>${esc(pendingImport.groupName)}</b> con ${pendingImport.players.length} giocatori.</span>
        <span class="row"><button class="primary" data-action="import-merge">Aggiorna i miei dati</button>
        <button data-action="import-ignore">Ignora</button></span></div></div>`;
    } else if (!player(me)) {
      el.innerHTML = `<div class="banner"><div class="card"><span>👋 Benvenuto! Per prima cosa scegli <b>chi sei</b> nel menu in alto a destra, poi compila il tuo profilo e vota i giochi.</span></div></div>`;
    } else el.innerHTML = '';
  }

  // ----- Tab Gruppo -----
  function seg(action, id, current, options) {
    return `<div class="seg" role="group">${options.map(([val, label]) =>
      `<button data-action="${action}" data-id="${id}" data-value="${val}" aria-pressed="${String(current) === String(val)}">${label}</button>`).join('')}</div>`;
  }

  function viewGroup() {
    const cards = state.players.map((p) => {
      const isMe = p.id === me;
      const genres = Object.entries(GENRES).map(([k, label]) => {
        const lvl = p.genres[k] ?? 1;
        return `<button class="chip" data-action="genre" data-id="${p.id}" data-genre="${k}" data-level="${lvl}" title="${['Non mi piace', 'Indifferente', 'Mi piace', 'Lo adoro'][lvl]}">${['🙅 ', '', '👍 ', '❤️ '][lvl]}${label}</button>`;
      }).join('');
      return `<section class="card player ${isMe ? 'me' : ''} ${p.active === false ? 'inactive' : ''}">
        <div class="player-head">
          <button class="emoji-btn" data-action="emoji" data-id="${p.id}" title="Cambia avatar">${p.emoji}</button>
          <input type="text" value="${esc(p.name)}" data-field="name" data-id="${p.id}" aria-label="Nome" maxlength="24">
          ${isMe ? '<span class="badge good">Tu</span>' : ''}
        </div>
        <label class="check"><input type="checkbox" data-field="active" data-id="${p.id}" ${p.active !== false ? 'checked' : ''}> Partecipa alla serata</label>
        <div class="field"><span>Gioca su</span>${seg('set', p.id + ':platform', p.platform, [['pc', '🖥️ PC'], ['xbox', '🟢 Xbox']])}</div>
        <div class="field"><span>Abbonamento Game Pass</span>${seg('set', p.id + ':gamePass', p.gamePass, [['none', 'Nessuno'], ['pc', 'PC Game Pass'], ['ultimate', 'Ultimate']])}</div>
        <div class="field"><span>Quanto è disposto a spendere</span>
          <select data-field="budget" data-id="${p.id}">${['Solo giochi gratis', 'Fino a 15€', 'Fino a 30€', 'Fino a 50€', 'Anche oltre 50€'].map((l, i) => `<option value="${i}" ${p.budget === i ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><span>Generi (tocca per cambiare: indifferente → mi piace → adoro → no)</span><div class="chips">${genres}</div></div>
        <div class="field"><span>Stile di gioco</span>
          <input type="range" min="0" max="100" step="5" value="${p.style}" data-field="style" data-id="${p.id}">
          <div class="range-labels"><span>🤝 Tutti insieme contro il gioco</span><span>⚔️ Sfidare altri</span></div></div>
        <div class="field"><span>Complessità sopportata</span>${seg('set', p.id + ':maxComplexity', p.maxComplexity, [[1, 'Semplice'], [2, 'Media'], [3, 'Anche tosta']])}</div>
        <div class="field"><span>Riflessi</span>${seg('set', p.id + ':reflexes', p.reflexes, [[1, '🐢 Lento ma saggio'], [2, 'Me la cavo'], [3, '⚡ Ancora reattivo']])}</div>
        <div class="field"><span>Durata ideale</span>${seg('set', p.id + ':session', p.session, [[1, 'Partite brevi'], [2, 'Un\'oretta'], [3, 'Tutta la sera']])}</div>
        <div class="row">
          ${!isMe ? `<button data-action="be" data-id="${p.id}">Sono io</button>` : ''}
          <button class="danger" data-action="remove-player" data-id="${p.id}">Rimuovi</button>
        </div>
      </section>`;
    }).join('');

    return `<div class="section-head">
        <div><h2>Il gruppo</h2><p class="muted">Ognuno compila il proprio profilo (o lo compila uno per tutti). Chi salta una settimana: togli "Partecipa".</p></div>
        <div class="toolbar">
          <label class="field"><span>Nome del gruppo</span><input type="text" value="${esc(state.groupName)}" data-field="groupName" maxlength="40"></label>
          ${state.players.length < MAX_PLAYERS ? '<button data-action="add-player">+ Aggiungi giocatore</button>' : ''}
        </div>
      </div>
      <div class="grid">${cards}</div>`;
  }

  // ----- Tab Catalogo -----
  function voteButtons(g, p) {
    const current = p.votes[g.id];
    const owned = p.owned.includes(g.id);
    return `<div class="votes">${Object.entries(Scoring.VOTES).map(([k, v]) =>
      `<button class="${k}" data-action="vote" data-game="${g.id}" data-value="${k}" aria-pressed="${current === k}" title="${v.label}">${v.icon} ${v.label}</button>`).join('')}
      <button data-action="own" data-game="${g.id}" aria-pressed="${owned}" title="Ce l'ho già (non deve comprarlo)">📦 Ce l'ho</button></div>`;
  }

  function othersVotes(g) {
    const parts = state.players.filter((p) => p.id !== me && (p.votes[g.id] || p.owned.includes(g.id)))
      .map((p) => `<span title="${esc(p.name)}">${p.emoji} ${p.votes[g.id] ? Scoring.VOTES[p.votes[g.id]].icon : ''}${p.owned.includes(g.id) ? '📦' : ''}</span>`);
    return parts.length ? `<div class="others">Gli altri: ${parts.join(' ')}</div>` : '';
  }

  function viewCatalog() {
    const p = player(me);
    const size = activePlayers().length;
    const q = ui.search.trim().toLowerCase();
    const games = allGames().filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (ui.genre && !g.genres.includes(ui.genre)) return false;
      if (ui.onlyFit && size > g.maxParty) return false;
      if (ui.onlyFree && !(g.priceTier === 0 || g.gamePass)) return false;
      if (ui.toVote && p && p.votes[g.id]) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const voted = p ? Object.keys(p.votes).length : 0;
    const cards = games.map((g) => `<article class="card game">
        ${imageHtml(g)}
        <div class="game-body">
          <h3>${esc(g.name)}</h3>
          <div class="badges">${gameBadges(g)}</div>
          <p>${esc(g.pitch || '')}</p>
          ${gameDetails(g)}
          ${othersVotes(g)}
          ${p ? voteButtons(g, p) : ''}
          ${g.custom ? `<button class="danger" data-action="remove-custom" data-game="${g.id}">Rimuovi dal catalogo</button>` : ''}
        </div>
      </article>`).join('');

    return `<div class="section-head">
        <div><h2>Vota i giochi</h2>
        <p class="muted">${p ? `Stai votando come <b>${p.emoji} ${esc(p.name)}</b> · ${voted} su ${allGames().length} votati. Non serve votarli tutti: il punteggio usa anche i tuoi gusti.` : 'Scegli chi sei in alto per poter votare.'}</p></div>
      </div>
      <div class="card toolbar" style="margin-bottom:1rem">
        <input type="text" placeholder="🔎 Cerca un gioco" value="${esc(ui.search)}" data-ui="search" aria-label="Cerca">
        <select data-ui="genre" aria-label="Genere"><option value="">Tutti i generi</option>${Object.entries(GENRES).map(([k, l]) => `<option value="${k}" ${ui.genre === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" data-ui="onlyFit" ${ui.onlyFit ? 'checked' : ''}> Ci stiamo tutti e ${size}</label>
        <label class="check"><input type="checkbox" data-ui="onlyFree" ${ui.onlyFree ? 'checked' : ''}> Gratis o Game Pass</label>
        ${p ? `<label class="check"><input type="checkbox" data-ui="toVote" ${ui.toVote ? 'checked' : ''}> Solo quelli che non ho votato</label>` : ''}
      </div>
      ${games.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Nessun gioco con questi filtri.</div>'}
      ${viewCandidates()}
      ${viewAddGame()}`;
  }

  function viewCandidates() {
    const known = new Set(allGames().map((g) => g.appid).filter(Boolean));
    const list = (steam.candidates || []).filter((c) => !known.has(c.appid));
    if (!list.length) return '';
    return `<h2 style="margin-top:2rem">Dal catalogo Steam: altri giochi cross-platform</h2>
      <p class="muted">I più venduti su Steam con multiplayer multipiattaforma. Attenzione: Steam non specifica se il cross-play include Xbox, verificate prima di aggiungerli.</p>
      <div class="grid">${list.map((c) => `<article class="card game">
        ${imageHtml({ name: c.name, appid: c.appid })}
        <div class="game-body"><h3>${esc(c.name)}</h3>
          <div class="badges">${c.isFree ? '<span class="badge good">Gratis</span>' : c.price ? `<span class="badge">${esc(c.price.formatted)}</span>` : ''}
          ${c.coop ? '<span class="badge">Co-op online</span>' : ''}${c.pvp ? '<span class="badge">PvP online</span>' : ''}</div>
          <p class="small muted">${esc(c.shortDescription || '')}</p>
          <div class="row"><a href="https://store.steampowered.com/app/${c.appid}/" target="_blank" rel="noopener">Pagina Steam ↗</a>
          <button data-action="prefill" data-appid="${c.appid}">Aggiungi al nostro catalogo</button></div>
        </div></article>`).join('')}</div>`;
  }

  function viewAddGame() {
    const pre = ui.prefill || {};
    return `<details class="card" style="margin-top:2rem" ${ui.prefill ? 'open' : ''} id="add-game">
      <summary><b>➕ Aggiungi un gioco che non c'è</b></summary>
      <form data-form="add-game" class="stack" style="margin-top:1rem">
        <div class="form-grid">
          <label class="field"><span>Nome</span><input type="text" name="name" required value="${esc(pre.name || '')}"></label>
          <label class="field"><span>Link Steam o appid (facoltativo)</span><input type="text" name="steam" value="${esc(pre.appid || '')}"></label>
          <label class="field"><span>Quanti possono giocare insieme</span><input type="text" inputmode="numeric" name="maxParty" value="4" required></label>
          <label class="field"><span>Prezzo</span><select name="priceTier">${Scoring.PRICE_TIERS.map((l, i) => `<option value="${i}" ${pre.priceTier === i ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Tipo</span><select name="competitive"><option value="0">Cooperativo</option><option value="0.5">Misto</option><option value="1">Competitivo</option></select></label>
          <label class="field"><span>Difficoltà</span><select name="complexity"><option value="1">Facile</option><option value="2" selected>Media</option><option value="3">Impegnativa</option></select></label>
          <label class="field"><span>Riflessi</span><select name="reflexes"><option value="1">Pochi</option><option value="2" selected>Medi</option><option value="3">Tanti</option></select></label>
          <label class="field"><span>Durata</span><select name="session"><option value="1">Partite brevi</option><option value="2" selected>Un'oretta</option><option value="3">Serata lunga</option></select></label>
        </div>
        <div class="field"><span>Generi</span><div class="chips">${Object.entries(GENRES).map(([k, l]) => `<label class="check badge"><input type="checkbox" name="genres" value="${k}"> ${l}</label>`).join('')}</div></div>
        <div class="row">
          <label class="check"><input type="checkbox" name="crossplay" checked> Cross-play PC/Xbox verificato</label>
          <label class="check"><input type="checkbox" name="gamePass"> Nel Game Pass</label>
        </div>
        <div><button class="primary" type="submit">Aggiungi al catalogo</button></div>
      </form></details>`;
  }

  // ----- Tab Consigliati -----
  function bars(r) {
    return `<div class="bars">${r.per.map((x) => `<div class="bar">
        <span>${x.player.emoji} ${esc(x.player.name)}</span>
        <span class="bar-track"><span class="bar-fill ${x.score < 45 ? 'low' : ''}" style="width:${x.score}%;display:block"></span></span>
        <b>${x.score}</b>
        ${x.reasons.length ? `<span class="why">${esc(x.reasons.join(' · '))}</span>` : ''}
      </div>`).join('')}</div>`;
  }

  function viewResults() {
    const size = activePlayers().length;
    if (!size) return '<div class="empty">Nessun giocatore partecipa: attivane qualcuno nel tab Gruppo.</div>';
    const { ranked, excluded } = ranking();
    const fresh = activePlayers().filter((p) => !p.updatedAt).map((p) => esc(p.name));
    const top = ranked.slice(0, 12);

    return `<div class="section-head">
        <div><h2>I giochi più adatti a voi ${size}</h2>
        <p class="muted">Punteggio di gruppo = 60% media + 40% del più scontento: vince chi va bene a tutti, non chi entusiasma solo qualcuno.</p></div>
        <label class="check"><input type="checkbox" data-setting="allowSplit" ${state.settings.allowSplit ? 'checked' : ''}> Includi giochi dove dovete dividervi</label>
      </div>
      ${fresh.length ? `<p class="card" style="margin-bottom:1rem">⚠️ Profili ancora da compilare: <b>${fresh.join(', ')}</b>. Per ora usiamo gusti di default.</p>` : ''}
      ${top.length ? top.map((r, i) => `<article class="card result">
        ${imageHtml(r.game, `<span class="rank">#${i + 1}</span>`)}
        <div>
          <div class="row" style="justify-content:space-between">
            <div><h3>${esc(r.game.name)}</h3><div class="badges" style="margin-top:.3rem">${priceBadges(r.game)}<span class="badge">👥 max ${r.game.maxParty}</span></div></div>
            <div class="score-big" title="Punteggio di gruppo">${r.score}</div>
          </div>
          ${r.notes.length ? `<p class="small"><b>${esc(r.notes.join(' · '))}</b></p>` : ''}
          <p class="small muted">${esc(r.game.pitch || '')}</p>
          ${bars(r)}
          <div class="row" style="margin-top:.7rem">
            <button class="primary" data-action="pick" data-game="${r.game.id}">${state.night.gameId === r.game.id ? '✅ Gioco della serata' : 'Scegli per la serata'}</button>
            <a href="${esc(storeUrl(r.game))}" target="_blank" rel="noopener">Store ↗</a>
          </div>
        </div>
      </article>`).join('') : '<div class="empty">Nessun gioco supera i filtri: provate a includere i giochi dove dovete dividervi, o a togliere qualche veto.</div>'}
      ${excluded.length ? `<details class="card" style="margin-top:1rem"><summary>Scartati (${excluded.length})</summary>
        <ul>${excluded.map((e) => `<li>${esc(e.game.name)} — <span class="muted">${esc(e.why)}</span></li>`).join('')}</ul></details>` : ''}`;
  }

  // ----- Tab Serata -----
  function viewNight() {
    const n = state.night;
    const g = n.gameId ? gameById(n.gameId) : null;
    const history = [...n.history].reverse();
    return `<div class="section-head"><div><h2>La serata della settimana</h2>
        <p class="muted">Fissate giorno e ora, scegliete il gioco e mandate il promemoria al gruppo.</p></div></div>
      <section class="card night-hero">
        ${g ? imageHtml(g) : '<div class="wheel" id="wheel">Nessun gioco scelto</div>'}
        <div class="stack">
          ${g ? `<div><p class="muted">Si gioca a</p><h2>${esc(g.name)}</h2>
            <p>🔀 ${esc(g.crossplay || '')}</p>${g.accounts ? `<p>🔑 ${esc(g.accounts)}</p>` : ''}${g.partyNote ? `<p>👥 ${esc(g.partyNote)}</p>` : ''}</div>` : ''}
          <div class="row">
            <label class="field"><span>Giorno</span><select data-night="day">${DAYS.map((d, i) => `<option value="${i}" ${n.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
            <label class="field"><span>Ora</span><input type="time" value="${esc(n.time)}" data-night="time"></label>
          </div>
          <div class="row">
            <button data-action="spin">🎲 Lascia decidere alla sorte (tra i primi 5)</button>
            ${g ? `<button data-action="ics">📅 Promemoria calendario</button>
            <button data-action="whatsapp">💬 Avvisa su WhatsApp</button>
            <button class="primary" data-action="played">✅ Serata fatta!</button>` : ''}
          </div>
          <div class="wheel" id="spin-out" hidden></div>
        </div>
      </section>
      <h2 style="margin-top:2rem">Diario delle serate</h2>
      ${history.length ? `<ul class="history">${history.map((h) => {
        const hg = gameById(h.gameId);
        return `<li><span><b>${new Date(h.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</b> · ${esc(hg ? hg.name : h.gameId)}</span>
          <span class="row"><span class="stars">${[1, 2, 3, 4, 5].map((s) => `<button data-action="rate" data-date="${h.date}" data-value="${s}" title="${s} stelle">${s <= (h.rating || 0) ? '★' : '☆'}</button>`).join('')}</span>
          <button class="danger" data-action="del-history" data-date="${h.date}" title="Elimina">✕</button></span></li>`;
      }).join('')}</ul>` : '<p class="muted">Ancora nessuna serata registrata. Dopo ogni serata premete "Serata fatta!" e date un voto: i giochi appena giocati scendono un po\' in classifica per variare.</p>'}`;
  }

  function nextNight() {
    const [hh, mm] = (state.night.time || '21:30').split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    let add = (state.night.day - d.getDay() + 7) % 7;
    if (add === 0 && d < new Date()) add = 7;
    d.setDate(d.getDate() + add);
    return d;
  }

  function downloadIcs() {
    const g = gameById(state.night.gameId);
    const start = nextNight();
    const end = new Date(start.getTime() + 2.5 * 3600 * 1000);
    const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
    const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][state.night.day];
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Attempatoni//Serata//IT', 'BEGIN:VEVENT',
      `UID:${uid()}@attempatoni`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      `SUMMARY:🎮 ${state.groupName}: ${g.name}`,
      `DESCRIPTION:${(g.crossplay || '').replace(/[,;]/g, '\\$&')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Tra mezz\'ora si gioca!', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    download('serata-attempatoni.ics', ics, 'text/calendar');
  }

  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function spin() {
    const top = ranking().ranked.slice(0, 5);
    if (!top.length) return toast('Nessun gioco disponibile: votate prima qualcosa!');
    const out = $('#spin-out');
    out.hidden = false;
    out.classList.add('spinning');
    // estrazione pesata: più punti, più probabilità
    const weights = top.map((r) => Math.max(1, r.score) ** 2);
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    const winner = top.find((r, i) => (x -= weights[i]) < 0) || top[0];
    let ticks = 0;
    const timer = setInterval(() => {
      out.textContent = top[ticks % top.length].game.name;
      if (++ticks > 18) {
        clearInterval(timer);
        out.classList.remove('spinning');
        out.textContent = `🎉 ${winner.game.name}`;
        setTimeout(() => setNightGame(winner.game.id), 1200);
      }
    }, 90 + ticks * 4);
  }

  function setNightGame(id) {
    state.night.gameId = id;
    state.night.updatedAt = Date.now();
    save();
    render();
  }

  // ----- Tab Condividi -----
  function viewShare() {
    return `<div class="section-head"><div><h2>Condividi con il gruppo</h2>
        <p class="muted">L'app non ha server: i dati restano nel vostro browser. Per metterli in comune ci si scambia un link.</p></div></div>
      <div class="stack">
        <section class="card stack">
          <h3>1. Mandate il link al gruppo</h3>
          <p>Il link contiene profili, voti e serata. Chi lo apre vede i dati aggiornati, compila la sua parte e rimanda il link: per ogni giocatore vince la versione più recente, quindi nessuno sovrascrive gli altri.</p>
          <div class="row">
            <button class="primary" data-action="copy-link">📋 Copia link del gruppo</button>
            <button data-action="share-wa">💬 Invia su WhatsApp</button>
          </div>
        </section>
        <section class="card stack">
          <h3>2. Backup su file</h3>
          <div class="row">
            <button data-action="export">💾 Scarica backup</button>
            <label class="check"><button data-action="import-file">📂 Carica backup</button></label>
            <input type="file" accept="application/json,.json" id="import-input" hidden>
          </div>
        </section>
        <section class="card stack">
          <h3>3. Ricominciare da zero</h3>
          <p class="muted">Cancella tutti i dati salvati in questo browser.</p>
          <div><button class="danger" data-action="reset">🗑️ Cancella tutto</button></div>
        </section>
      </div>`;
  }

  // ---------- condivisione ----------
  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  async function encodeState() {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    if ('CompressionStream' in window) {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
    }
    return 'j' + b64url(bytes);
  }

  async function decodeState(code) {
    const bytes = fromB64url(code.slice(1));
    if (code[0] === 'z') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(stream).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function shareLink() {
    return `${location.href.split('#')[0]}#s=${await encodeState()}`;
  }

  function mergeState(incoming) {
    const removed = new Set([...(state.removed || []), ...(incoming.removed || [])]);
    const byId = new Map(state.players.map((p) => [p.id, p]));
    for (const p of incoming.players || []) {
      const local = byId.get(p.id);
      if (!local || (p.updatedAt || 0) > (local.updatedAt || 0)) byId.set(p.id, { ...defaultPlayer(0), ...p });
    }
    state.players = [...byId.values()].filter((p) => !removed.has(p.id)).slice(0, MAX_PLAYERS);
    state.removed = [...removed];
    const custom = new Map(state.custom.map((g) => [g.id, g]));
    for (const g of incoming.custom || []) if (!custom.has(g.id)) custom.set(g.id, g);
    state.custom = [...custom.values()];
    if (incoming.night && (incoming.night.updatedAt || 0) > (state.night.updatedAt || 0)) state.night = incoming.night;
    if (incoming.groupName && (incoming.night?.updatedAt || 0) >= (state.night.updatedAt || 0)) state.groupName = incoming.groupName;
    save();
  }

  let pendingImport = null;
  async function checkHash() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (!m) return;
    try {
      pendingImport = await decodeState(m[1]);
      // Primo accesso: niente da perdere, si importa direttamente
      if (!store.get(STORAGE_KEY)) {
        state = { ...defaultState(), ...pendingImport };
        save();
        pendingImport = null;
        toast('Dati del gruppo caricati!');
      }
    } catch {
      toast('Link non valido o incompleto');
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  // ---------- eventi ----------
  function handleAction(btn) {
    const { action, id, game, value } = btn.dataset;
    const p = id ? player(id.split(':')[0]) : null;
    const mine = player(me);

    switch (action) {
      case 'set': {
        const [pid, field] = id.split(':');
        const target = player(pid);
        target[field] = /^\d+$/.test(value) ? Number(value) : value;
        touch(target);
        break;
      }
      case 'genre': {
        const lvl = p.genres[btn.dataset.genre] ?? 1;
        p.genres[btn.dataset.genre] = [2, 3, 0, 1][lvl];
        touch(p);
        break;
      }
      case 'emoji':
        p.emoji = EMOJIS[(EMOJIS.indexOf(p.emoji) + 1) % EMOJIS.length];
        touch(p);
        break;
      case 'be':
        me = id;
        store.set(ME_KEY, me);
        break;
      case 'add-player': {
        const np = defaultPlayer(state.players.length);
        np.updatedAt = Date.now();
        state.players.push(np);
        save();
        break;
      }
      case 'remove-player':
        if (!confirm(`Rimuovere ${p.name} dal gruppo? Si perdono i suoi voti.`)) return;
        state.players = state.players.filter((x) => x.id !== p.id);
        state.removed = [...(state.removed || []), p.id];
        if (me === p.id) { me = null; store.del(ME_KEY); }
        save();
        break;
      case 'vote':
        if (!mine) return toast('Prima scegli chi sei in alto');
        if (mine.votes[game] === value) delete mine.votes[game];
        else mine.votes[game] = value;
        touch(mine);
        break;
      case 'own':
        if (!mine) return toast('Prima scegli chi sei in alto');
        mine.owned = mine.owned.includes(game) ? mine.owned.filter((x) => x !== game) : [...mine.owned, game];
        touch(mine);
        break;
      case 'remove-custom':
        state.custom = state.custom.filter((g) => g.id !== game);
        save();
        break;
      case 'prefill': {
        const c = (steam.candidates || []).find((x) => String(x.appid) === btn.dataset.appid);
        ui.prefill = { name: c.name, appid: c.appid, priceTier: c.isFree ? 0 : Scoring.priceTierFromCents(c.price && c.price.initial) };
        render();
        $('#add-game').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      case 'pick':
        setNightGame(game);
        toast('Gioco della serata scelto!');
        return;
      case 'spin': spin(); return;
      case 'ics': downloadIcs(); return;
      case 'whatsapp': {
        const g = gameById(state.night.gameId);
        const when = nextNight().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        const text = `🎮 ${state.groupName}\n${when} alle ${state.night.time} si gioca a *${g.name}*!\n🔀 ${g.crossplay || ''}${g.accounts ? `\n🔑 ${g.accounts}` : ''}\n${storeUrl(g)}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        return;
      }
      case 'played': {
        const today = new Date().toISOString().slice(0, 10);
        if (state.night.history.some((h) => h.date === today && h.gameId === state.night.gameId)) return toast('Serata di oggi già registrata');
        state.night.history.push({ date: today, gameId: state.night.gameId, rating: 0 });
        state.night.updatedAt = Date.now();
        save();
        toast('Registrata! Datele un voto nel diario.');
        break;
      }
      case 'rate':
      case 'del-history': {
        const i = state.night.history.findIndex((h) => h.date === btn.dataset.date);
        if (i < 0) return;
        if (action === 'rate') state.night.history[i].rating = Number(value);
        else state.night.history.splice(i, 1);
        state.night.updatedAt = Date.now();
        save();
        break;
      }
      case 'copy-link':
        shareLink().then((url) => navigator.clipboard.writeText(url))
          .then(() => toast('Link copiato: incollatelo nel gruppo WhatsApp'))
          .catch(() => toast('Copia non riuscita: usate "Invia su WhatsApp"'));
        return;
      case 'share-wa':
        shareLink().then((url) => window.open(`https://wa.me/?text=${encodeURIComponent(`🎮 ${state.groupName}: aprite il link, scegliete chi siete e votate i giochi!\n${url}`)}`, '_blank', 'noopener'));
        return;
      case 'export':
        download(`attempatoni-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
        return;
      case 'import-file':
        $('#import-input').click();
        return;
      case 'import-merge':
        mergeState(pendingImport);
        pendingImport = null;
        toast('Dati del gruppo aggiornati!');
        break;
      case 'import-ignore':
        pendingImport = null;
        break;
      case 'reset':
        if (!confirm('Cancellare davvero tutti i dati del gruppo da questo browser?')) return;
        state = defaultState();
        me = null;
        store.del(ME_KEY);
        save();
        break;
      default:
        return;
    }
    render();
  }

  function addCustomGame(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name')).trim();
    if (!name) return;
    const steamField = String(fd.get('steam') || '');
    const appidMatch = steamField.match(/(?:app\/)?(\d{3,})/);
    const genres = fd.getAll('genres');
    state.custom.push({
      id: 'custom-' + uid(),
      custom: true,
      name,
      appid: appidMatch ? Number(appidMatch[1]) : null,
      store: 'steam',
      priceTier: Number(fd.get('priceTier')),
      gamePass: fd.get('gamePass') === 'on',
      maxParty: Math.max(1, parseInt(fd.get('maxParty'), 10) || 4),
      genres: genres.length ? genres : ['party'],
      competitive: Number(fd.get('competitive')),
      complexity: Number(fd.get('complexity')),
      reflexes: Number(fd.get('reflexes')),
      session: Number(fd.get('session')),
      crossplayPcXbox: fd.get('crossplay') === 'on',
      crossplay: fd.get('crossplay') === 'on' ? 'Cross-play PC/Xbox (segnalato dal gruppo).' : 'Cross-play PC/Xbox non verificato.',
      pitch: 'Aggiunto dal gruppo.',
    });
    ui.prefill = null;
    save();
    render();
    toast(`${name} aggiunto al catalogo`);
  }

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tabs button');
    if (tabBtn) {
      tab = tabBtn.dataset.tab;
      store.set(TAB_KEY, tab);
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (btn) { e.preventDefault(); handleAction(btn); }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form === 'add-game') { e.preventDefault(); addCustomGame(e.target); }
  });

  // input testuali: salva senza ridisegnare (non perde il cursore); il resto ridisegna
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.field === 'name') {
      const p = player(el.dataset.id);
      p.name = el.value;
      touch(p);
      const opt = $(`#whoami option[value="${p.id}"]`);
      if (opt) opt.textContent = `${p.emoji} ${p.name}`;
    } else if (el.dataset.field === 'groupName') {
      state.groupName = el.value || 'Serata Attempatoni';
      save();
      $('#group-title').textContent = state.groupName;
    } else if (el.dataset.ui === 'search') {
      ui.search = el.value;
      const pos = el.selectionStart;
      render();
      const again = $('[data-ui="search"]');
      again.focus();
      again.setSelectionRange(pos, pos);
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'whoami') {
      me = el.value || null;
      if (me) store.set(ME_KEY, me); else store.del(ME_KEY);
    } else if (el.id === 'import-input') {
      const file = el.files[0];
      if (!file) return;
      file.text().then((txt) => {
        mergeState(JSON.parse(txt));
        render();
        toast('Backup caricato');
      }).catch(() => toast('File non valido'));
      return;
    } else if (el.dataset.field === 'active') {
      const p = player(el.dataset.id);
      p.active = el.checked;
      touch(p);
    } else if (el.dataset.field === 'budget' || el.dataset.field === 'style') {
      const p = player(el.dataset.id);
      p[el.dataset.field] = Number(el.value);
      touch(p);
    } else if (el.dataset.ui && el.dataset.ui !== 'search') {
      ui[el.dataset.ui] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (el.dataset.setting) {
      state.settings[el.dataset.setting] = el.checked;
      save();
    } else if (el.dataset.night) {
      state.night[el.dataset.night] = el.dataset.night === 'day' ? Number(el.value) : el.value;
      state.night.updatedAt = Date.now();
      save();
    } else return;
    render();
  });

  checkHash().finally(render);
})();
