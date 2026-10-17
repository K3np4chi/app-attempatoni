/* global GAMES, GENRES, STEAM_DATA, Scoring */
(function () {
  'use strict';

  const STORAGE_KEY = 'attempatoni:v1';
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
  };
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch { /* niente vibrazione */ } };

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
      style: 50,
      maxComplexity: 2,
      reflexes: 2,
      session: 2,
      votes: {},
      owned: [],
      profileDone: false,
    };
  }

  function defaultState() {
    return {
      v: 1,
      groupName: 'Serata Attempatoni',
      players: Array.from({ length: 5 }, (_, i) => defaultPlayer(i)),
      custom: [],
      settings: { allowSplit: false },
      night: { gameId: null, day: 4, time: '21:30', history: [] },
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
  let tab = store.get(TAB_KEY) || 'gruppo';
  const ui = {
    editing: null, // giocatore aperto nel tab Gruppo
    turn: null, // { pid, queue, i, step: 'profile' | 'vote' } durante il turno di voto
    handoff: null, // id di chi ha appena finito il turno
    browse: false, // vista catalogo completo invece del turno
    voter: null, // chi vota nella vista catalogo
    search: '', genre: '', onlyFit: false, onlyFree: false,
    prefill: null,
  };

  function save() { store.set(STORAGE_KEY, JSON.stringify(state)); }
  const player = (id) => state.players.find((p) => p.id === id);
  const activePlayers = () => state.players.filter((p) => p.active !== false);

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
    const img = src
      ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:this.dataset.name}))" data-name="${esc(g.name)}">`
      : `<span>${esc(g.name)}</span>`;
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
    const fit = activePlayers().length <= g.maxParty;
    const info = steamInfo(g);
    const b = [priceBadges(g)];
    b.push(`<span class="badge ${fit ? 'good' : 'warn'}">👥 max ${g.maxParty}</span>`);
    if (g.store !== 'steam') b.push(`<span class="badge">${{ epic: 'Epic Games', msstore: 'Microsoft Store', battlenet: 'Battle.net' }[g.store] || esc(g.store)}</span>`);
    if (info && info.reviews) b.push(`<span class="badge">👍 ${info.reviews.pct}% su Steam</span>`);
    b.push(`<span class="badge">${['', 'Facile', 'Medio', 'Impegnativo'][g.complexity]}</span>`);
    if (g.reflexes === 1) b.push('<span class="badge good">Pochi riflessi</span>');
    if (g.reflexes === 3) b.push('<span class="badge warn">Riflessi pronti</span>');
    if (g.custom) b.push('<span class="badge warn">Aggiunto da voi</span>');
    return b.join('');
  }

  function gameDetails(g, open = false) {
    const info = steamInfo(g);
    return `<details ${open ? 'open' : ''}><summary>Cross-play e dettagli</summary>
      <p>🔀 ${esc(g.crossplay || 'Cross-play PC/Xbox')}</p>
      ${g.partyNote ? `<p>👥 ${esc(g.partyNote)}</p>` : ''}
      ${g.accounts ? `<p>🔑 ${esc(g.accounts)}</p>` : ''}
      <p>🏷️ ${g.genres.map((x) => esc(GENRES[x] || x)).join(', ')}</p>
      ${info && info.shortDescription ? `<p class="muted">${esc(info.shortDescription)}</p>` : ''}
      <p><a href="${esc(storeUrl(g))}" target="_blank" rel="noopener">Pagina dello store ↗</a></p>
    </details>`;
  }

  function ranking() {
    return Scoring.rankGames(allGames(), state.players, {
      allowSplit: state.settings.allowSplit,
      recent: state.night.history.slice(-2).map((h) => h.gameId),
      steam: steam.apps,
    });
  }

  const votedCount = (p) => Object.keys(p.votes).filter((id) => gameById(id)).length;

  // ---------- render ----------
  function render() {
    document.title = state.groupName;
    $('#group-title').textContent = state.groupName;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const views = { gruppo: viewGroup, vota: viewVote, consigli: viewResults, serata: viewNight, altro: viewMore };
    $('#view').innerHTML = (views[tab] || viewGroup)();
  }

  function go(next) {
    tab = next;
    store.set(TAB_KEY, tab);
    render();
    window.scrollTo({ top: 0 });
  }

  // ----- profilo giocatore (usato nel tab Gruppo e all'inizio del turno) -----
  function seg(field, id, current, options) {
    return `<div class="seg" role="group">${options.map(([val, label]) =>
      `<button data-action="set" data-id="${id}" data-field="${field}" data-value="${val}" aria-pressed="${String(current) === String(val)}">${label}</button>`).join('')}</div>`;
  }

  function profileEditor(p) {
    const genres = Object.entries(GENRES).map(([k, label]) => {
      const lvl = p.genres[k] ?? 1;
      return `<button class="chip" data-action="genre" data-id="${p.id}" data-genre="${k}" data-level="${lvl}">${['🙅 ', '', '👍 ', '❤️ '][lvl]}${label}</button>`;
    }).join('');
    return `<div class="stack-sm">
      <div class="player-head">
        <button class="emoji-btn" data-action="emoji" data-id="${p.id}" aria-label="Cambia avatar">${p.emoji}</button>
        <input type="text" value="${esc(p.name)}" data-input="name" data-id="${p.id}" aria-label="Nome" maxlength="24" enterkeyhint="done">
      </div>
      <div class="field"><span>Gioca su</span>${seg('platform', p.id, p.platform, [['pc', '🖥️ PC'], ['xbox', '🟢 Xbox']])}</div>
      <div class="field"><span>Game Pass</span>${seg('gamePass', p.id, p.gamePass, [['none', 'No'], ['pc', 'PC'], ['ultimate', 'Ultimate']])}</div>
      <div class="field"><span>Quanto spende al massimo</span>${seg('budget', p.id, p.budget, [[0, 'Gratis'], [1, '15€'], [2, '30€'], [3, '50€'], [4, '50€+']])}</div>
      <div class="field"><span>Generi · tocca: indifferente → 👍 → ❤️ → 🙅</span><div class="chips">${genres}</div></div>
      <div class="field"><span>Stile di gioco</span>${seg('style', p.id, p.style, [[0, '🤝 Insieme'], [50, 'Un po\' e un po\''], [100, '⚔️ Sfide']])}</div>
      <div class="field"><span>Complessità</span>${seg('maxComplexity', p.id, p.maxComplexity, [[1, 'Semplice'], [2, 'Media'], [3, 'Anche tosta']])}</div>
      <div class="field"><span>Riflessi</span>${seg('reflexes', p.id, p.reflexes, [[1, '🐢 Lento'], [2, 'Me la cavo'], [3, '⚡ Reattivo']])}</div>
      <div class="field"><span>Durata ideale</span>${seg('session', p.id, p.session, [[1, 'Partite brevi'], [2, 'Un\'oretta'], [3, 'Tutta la sera']])}</div>
    </div>`;
  }

  // ----- Tab Gruppo -----
  function viewGroup() {
    const rows = state.players.map((p) => {
      const open = ui.editing === p.id;
      return `<section class="card player ${p.active === false ? 'inactive' : ''}">
        <div class="player-row">
          <button class="player-open" data-action="edit" data-id="${p.id}" aria-expanded="${open}">
            <span class="avatar">${p.emoji}</span>
            <span class="player-meta"><b>${esc(p.name)}</b>
              <span class="muted small">${p.platform === 'pc' ? '🖥️ PC' : '🟢 Xbox'}${p.gamePass !== 'none' ? ' · Game Pass' : ''} · ${votedCount(p)} voti${p.profileDone ? '' : ' · profilo da fare'}</span></span>
            <span class="chev">${open ? '▴' : '▾'}</span>
          </button>
          <label class="switch" title="Partecipa"><input type="checkbox" data-input="active" data-id="${p.id}" ${p.active !== false ? 'checked' : ''}><span>C'è</span></label>
        </div>
        ${open ? `${profileEditor(p)}
          <div class="row" style="margin-top:.8rem">
            <button class="primary grow" data-action="start-turn" data-id="${p.id}">🗳️ Vota i giochi</button>
            <button class="danger" data-action="remove-player" data-id="${p.id}">Rimuovi</button>
          </div>` : ''}
      </section>`;
    }).join('');

    return `<div class="section-head">
        <h2>Il gruppo</h2>
        <p class="muted">Tocca un nome per il suo profilo. Chi salta la settimana: togli "C'è".</p>
      </div>
      <label class="field" style="margin-bottom:1rem"><span>Nome del gruppo</span><input type="text" value="${esc(state.groupName)}" data-input="groupName" maxlength="40" enterkeyhint="done"></label>
      <div class="stack-sm">${rows}</div>
      ${state.players.length < MAX_PLAYERS ? '<button class="wide" data-action="add-player" style="margin-top:1rem">+ Aggiungi giocatore</button>' : ''}
      <button class="primary wide" data-action="goto" data-value="vota" style="margin-top:.6rem">Tutti pronti? Si vota! →</button>`;
  }

  // ----- Tab Vota: turni con il telefono che passa di mano -----
  function buildQueue(p) {
    const size = activePlayers().length;
    const games = allGames();
    const rank = (g) => (p.votes[g.id] ? 2 : 0) + (size > g.maxParty ? 1 : 0);
    return games.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map((g) => g.id);
  }

  function startTurn(pid) {
    const p = player(pid);
    ui.turn = { pid, queue: buildQueue(p), i: 0, step: p.profileDone ? 'vote' : 'profile' };
    ui.handoff = null;
    ui.browse = false;
    go('vota');
  }

  function endTurn() {
    ui.handoff = ui.turn.pid;
    ui.turn = null;
    render();
    window.scrollTo({ top: 0 });
  }

  function viewVote() {
    if (ui.turn) return ui.turn.step === 'profile' ? viewTurnProfile() : viewTurn();
    if (ui.browse) return viewCatalog();
    const total = allGames().length;
    const done = ui.handoff ? player(ui.handoff) : null;
    const list = activePlayers().map((p) => {
      const n = votedCount(p);
      return `<button class="card pick-player ${p.id === ui.handoff ? 'done' : ''}" data-action="start-turn" data-id="${p.id}">
        <span class="avatar big">${p.emoji}</span>
        <span class="player-meta"><b>${esc(p.name)}</b>
          <span class="progress"><span style="width:${Math.round((100 * n) / total)}%"></span></span>
          <span class="muted small">${n === 0 ? 'Non ha ancora votato' : n >= total ? 'Ha votato tutto ✓' : `${n} su ${total} votati`}</span></span>
        <span class="chev">›</span>
      </button>`;
    }).join('');

    return `${done ? `<div class="card handoff">🎉 Grazie <b>${done.emoji} ${esc(done.name)}</b>!<br>Ora passa il telefono al prossimo.</div>` : ''}
      <div class="section-head">
        <h2>Chi vota adesso?</h2>
        <p class="muted">Ognuno a turno prende il telefono e vota i giochi uno alla volta. I voti degli altri restano nascosti, così nessuno si fa influenzare.</p>
      </div>
      <div class="stack-sm">${list || '<div class="empty">Nessun giocatore attivo.</div>'}</div>
      <div class="row" style="margin-top:1rem">
        <button class="grow" data-action="browse">📚 Sfoglia tutto il catalogo</button>
        <button class="primary grow" data-action="goto" data-value="consigli">🏆 Classifica</button>
      </div>`;
  }

  function viewTurnProfile() {
    const p = player(ui.turn.pid);
    return `<div class="turn-head"><span class="avatar">${p.emoji}</span><div><b>Tocca a ${esc(p.name)}</b><div class="muted small">Prima due domande su di te</div></div></div>
      <section class="card">${profileEditor(p)}</section>
      <div class="sticky-actions">
        <button data-action="end-turn">Annulla</button>
        <button class="primary grow" data-action="profile-done">Avanti: vota i giochi →</button>
      </div>`;
  }

  function viewTurn() {
    const t = ui.turn;
    const p = player(t.pid);
    const g = gameById(t.queue[t.i]);
    if (!g) { endTurn(); return ''; }
    const current = p.votes[g.id];
    const owned = p.owned.includes(g.id);
    const pct = Math.round((100 * t.i) / t.queue.length);
    return `<div class="turn-head">
        <span class="avatar">${p.emoji}</span>
        <div class="grow"><b>${esc(p.name)}</b> <span class="muted small">· gioco ${t.i + 1} di ${t.queue.length}</span>
          <span class="progress"><span style="width:${pct}%"></span></span></div>
        <button class="small-btn" data-action="end-turn">Ho finito</button>
      </div>
      <article class="card game turn-card">
        ${imageHtml(g)}
        <div class="game-body">
          <h3>${esc(g.name)}</h3>
          <div class="badges">${gameBadges(g)}</div>
          <p>${esc(g.pitch || '')}</p>
          ${gameDetails(g)}
        </div>
      </article>
      <div class="vote-grid">
        ${Object.entries(Scoring.VOTES).map(([k, v]) =>
          `<button class="vote ${k}" data-action="turn-vote" data-value="${k}" aria-pressed="${current === k}"><span>${v.icon}</span>${v.label}</button>`).join('')}
        <button class="vote own" data-action="turn-own" aria-pressed="${owned}"><span>📦</span>${owned ? 'Ce l\'ho già ✓' : 'Ce l\'ho già'}</button>
      </div>
      <div class="row turn-nav">
        <button data-action="turn-prev" ${t.i === 0 ? 'disabled' : ''}>‹ Indietro</button>
        <button data-action="turn-next">Salta ›</button>
      </div>`;
  }

  // Vista catalogo completo (con i voti di tutti visibili)
  function viewCatalog() {
    const voter = player(ui.voter) || activePlayers()[0];
    const size = activePlayers().length;
    const q = ui.search.trim().toLowerCase();
    const games = allGames().filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (ui.genre && !g.genres.includes(ui.genre)) return false;
      if (ui.onlyFit && size > g.maxParty) return false;
      if (ui.onlyFree && !(g.priceTier === 0 || g.gamePass)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const cards = games.map((g) => {
      const all = state.players.filter((p) => p.votes[g.id] || p.owned.includes(g.id))
        .map((p) => `<span>${p.emoji}${p.votes[g.id] ? Scoring.VOTES[p.votes[g.id]].icon : ''}${p.owned.includes(g.id) ? '📦' : ''}</span>`).join(' ');
      return `<article class="card game">
        ${imageHtml(g)}
        <div class="game-body">
          <h3>${esc(g.name)}</h3>
          <div class="badges">${gameBadges(g)}</div>
          <p>${esc(g.pitch || '')}</p>
          ${gameDetails(g)}
          ${all ? `<div class="others">Voti: ${all}</div>` : ''}
          ${voter ? `<div class="votes">${Object.entries(Scoring.VOTES).map(([k, v]) =>
            `<button class="${k}" data-action="vote" data-game="${g.id}" data-value="${k}" aria-pressed="${voter.votes[g.id] === k}" aria-label="${v.label}">${v.icon}</button>`).join('')}
            <button data-action="own" data-game="${g.id}" aria-pressed="${voter.owned.includes(g.id)}" aria-label="Ce l'ho già">📦</button></div>` : ''}
          ${g.custom ? `<button class="danger" data-action="remove-custom" data-game="${g.id}">Rimuovi dal catalogo</button>` : ''}
        </div>
      </article>`;
    }).join('');

    return `<div class="section-head">
        <button class="small-btn" data-action="unbrowse">‹ Turni di voto</button>
        <h2 style="margin-top:.6rem">Catalogo completo</h2>
        <p class="muted">Qui i voti di tutti sono visibili. Scegli chi sta votando:</p>
      </div>
      <div class="chips voter-chips">${activePlayers().map((p) => `<button class="chip" data-action="voter" data-id="${p.id}" data-level="${voter && voter.id === p.id ? 3 : 1}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div>
      <div class="card filters">
        <input type="search" placeholder="🔎 Cerca un gioco" value="${esc(ui.search)}" data-ui="search" aria-label="Cerca">
        <select data-ui="genre" aria-label="Genere"><option value="">Tutti i generi</option>${Object.entries(GENRES).map(([k, l]) => `<option value="${k}" ${ui.genre === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" data-ui="onlyFit" ${ui.onlyFit ? 'checked' : ''}> Ci stiamo tutti e ${size}</label>
        <label class="check"><input type="checkbox" data-ui="onlyFree" ${ui.onlyFree ? 'checked' : ''}> Gratis o Game Pass</label>
      </div>
      ${games.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Nessun gioco con questi filtri.</div>'}
      ${viewCandidates()}
      ${viewAddGame()}`;
  }

  function viewCandidates() {
    const known = new Set(allGames().map((g) => g.appid).filter(Boolean));
    const list = (steam.candidates || []).filter((c) => !known.has(c.appid));
    if (!list.length) return '';
    return `<h2 style="margin-top:2rem">Altri giochi cross-platform da Steam</h2>
      <p class="muted">I più venduti su Steam con multiplayer multipiattaforma. Steam non dice se il cross-play include Xbox: verificate prima di aggiungerli.</p>
      <div class="grid">${list.map((c) => `<article class="card game">
        ${imageHtml({ name: c.name, appid: c.appid })}
        <div class="game-body"><h3>${esc(c.name)}</h3>
          <div class="badges">${c.isFree ? '<span class="badge good">Gratis</span>' : c.price ? `<span class="badge">${esc(c.price.formatted)}</span>` : ''}
          ${c.coop ? '<span class="badge">Co-op online</span>' : ''}${c.pvp ? '<span class="badge">PvP online</span>' : ''}</div>
          <p class="small muted">${esc(c.shortDescription || '')}</p>
          <div class="row"><a href="https://store.steampowered.com/app/${c.appid}/" target="_blank" rel="noopener">Pagina Steam ↗</a>
          <button data-action="prefill" data-appid="${c.appid}">Aggiungi</button></div>
        </div></article>`).join('')}</div>`;
  }

  function viewAddGame() {
    const pre = ui.prefill || {};
    return `<details class="card" style="margin-top:2rem" ${ui.prefill ? 'open' : ''} id="add-game">
      <summary><b>➕ Aggiungi un gioco che non c'è</b></summary>
      <form data-form="add-game" class="stack-sm" style="margin-top:1rem">
        <label class="field"><span>Nome</span><input type="text" name="name" required value="${esc(pre.name || '')}"></label>
        <label class="field"><span>Link Steam o appid (facoltativo)</span><input type="text" name="steam" value="${esc(pre.appid || '')}"></label>
        <label class="field"><span>Quanti possono giocare insieme</span><input type="number" inputmode="numeric" min="1" name="maxParty" value="4" required></label>
        <label class="field"><span>Prezzo</span><select name="priceTier">${Scoring.PRICE_TIERS.map((l, i) => `<option value="${i}" ${pre.priceTier === i ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Tipo</span><select name="competitive"><option value="0">Cooperativo</option><option value="0.5">Misto</option><option value="1">Competitivo</option></select></label>
        <label class="field"><span>Difficoltà</span><select name="complexity"><option value="1">Facile</option><option value="2" selected>Media</option><option value="3">Impegnativa</option></select></label>
        <label class="field"><span>Riflessi</span><select name="reflexes"><option value="1">Pochi</option><option value="2" selected>Medi</option><option value="3">Tanti</option></select></label>
        <label class="field"><span>Durata</span><select name="session"><option value="1">Partite brevi</option><option value="2" selected>Un'oretta</option><option value="3">Serata lunga</option></select></label>
        <div class="field"><span>Generi</span><div class="chips">${Object.entries(GENRES).map(([k, l]) => `<label class="check badge"><input type="checkbox" name="genres" value="${k}"> ${l}</label>`).join('')}</div></div>
        <label class="check"><input type="checkbox" name="crossplay" checked> Cross-play PC/Xbox verificato</label>
        <label class="check"><input type="checkbox" name="gamePass"> Nel Game Pass</label>
        <button class="primary" type="submit">Aggiungi al catalogo</button>
      </form></details>`;
  }

  // ----- Tab Classifica -----
  function bars(r) {
    return `<div class="bars">${r.per.map((x) => `<div class="bar">
        <span class="bar-name">${x.player.emoji} ${esc(x.player.name)}</span>
        <span class="bar-track"><span class="bar-fill ${x.score < 45 ? 'low' : ''}" style="width:${x.score}%"></span></span>
        <b>${x.score}</b>
        ${x.reasons.length ? `<span class="why">${esc(x.reasons.join(' · '))}</span>` : ''}
      </div>`).join('')}</div>`;
  }

  function viewResults() {
    const size = activePlayers().length;
    if (!size) return '<div class="empty">Nessun giocatore partecipa: attivane qualcuno nel tab Gruppo.</div>';
    const { ranked, excluded } = ranking();
    const missing = activePlayers().filter((p) => !votedCount(p) && !p.profileDone).map((p) => esc(p.name));
    const top = ranked.slice(0, 12);

    return `<div class="section-head">
        <h2>I migliori per voi ${size}</h2>
        <p class="muted">Vince il gioco che va bene a tutti: conta la media ma anche chi è meno contento.</p>
        <label class="check"><input type="checkbox" data-setting="allowSplit" ${state.settings.allowSplit ? 'checked' : ''}> Includi giochi dove dovete dividervi</label>
      </div>
      ${missing.length ? `<p class="card notice">⚠️ Non hanno ancora votato: <b>${missing.join(', ')}</b>.</p>` : ''}
      ${top.length ? top.map((r, i) => `<article class="card result">
        ${imageHtml(r.game, `<span class="rank">#${i + 1}</span><span class="score-pill">${r.score}</span>`)}
        <div class="result-body">
          <h3>${esc(r.game.name)}</h3>
          <div class="badges">${priceBadges(r.game)}<span class="badge">👥 max ${r.game.maxParty}</span></div>
          ${r.notes.length ? `<p class="small"><b>${esc(r.notes.join(' · '))}</b></p>` : ''}
          <details><summary>Punteggio di ognuno</summary>${bars(r)}</details>
          <button class="${state.night.gameId === r.game.id ? '' : 'primary'} wide" data-action="pick" data-game="${r.game.id}">${state.night.gameId === r.game.id ? '✅ Gioco della serata' : 'Scegli per la serata'}</button>
        </div>
      </article>`).join('') : '<div class="empty">Nessun gioco supera i filtri: includete i giochi dove dovete dividervi, o togliete qualche veto.</div>'}
      ${excluded.length ? `<details class="card" style="margin-top:1rem"><summary>Scartati (${excluded.length})</summary>
        <ul>${excluded.map((e) => `<li>${esc(e.game.name)} — <span class="muted">${esc(e.why)}</span></li>`).join('')}</ul></details>` : ''}`;
  }

  // ----- Tab Serata -----
  function viewNight() {
    const n = state.night;
    const g = n.gameId ? gameById(n.gameId) : null;
    const history = [...n.history].reverse();
    return `<div class="section-head"><h2>La serata</h2></div>
      <section class="card stack-sm">
        ${g ? `${imageHtml(g)}<div><p class="muted small">Si gioca a</p><h2>${esc(g.name)}</h2></div>
          <p>🔀 ${esc(g.crossplay || '')}</p>${g.accounts ? `<p>🔑 ${esc(g.accounts)}</p>` : ''}${g.partyNote ? `<p>👥 ${esc(g.partyNote)}</p>` : ''}`
          : '<div class="empty">Nessun gioco scelto: sceglietelo dalla Classifica o lasciate decidere alla sorte.</div>'}
        <div class="wheel" id="spin-out" hidden></div>
        <button class="wide" data-action="spin">🎲 Lascia decidere alla sorte (tra i primi 5)</button>
        <div class="row">
          <label class="field grow"><span>Giorno</span><select data-night="day">${DAYS.map((d, i) => `<option value="${i}" ${n.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label class="field"><span>Ora</span><input type="time" value="${esc(n.time)}" data-night="time"></label>
        </div>
        ${g ? `<button class="wide" data-action="ics">📅 Aggiungi al calendario (ogni settimana)</button>
          <button class="wide" data-action="whatsapp">💬 Avvisa il gruppo su WhatsApp</button>
          <button class="primary wide" data-action="played">✅ Serata fatta!</button>` : ''}
      </section>
      <h2 style="margin-top:1.5rem">Diario delle serate</h2>
      ${history.length ? `<ul class="history">${history.map((h) => {
        const hg = gameById(h.gameId);
        return `<li><span><b>${new Date(h.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</b><br>${esc(hg ? hg.name : h.gameId)}</span>
          <span class="row"><span class="stars">${[1, 2, 3, 4, 5].map((s) => `<button data-action="rate" data-date="${h.date}" data-value="${s}" aria-label="${s} stelle">${s <= (h.rating || 0) ? '★' : '☆'}</button>`).join('')}</span>
          <button class="danger small-btn" data-action="del-history" data-date="${h.date}" aria-label="Elimina">✕</button></span></li>`;
      }).join('')}</ul>` : '<p class="muted">Dopo ogni serata premete "Serata fatta!" e date le stelline: i giochi appena fatti scendono un po\' in classifica, per variare.</p>'}`;
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
      buzz();
      if (++ticks > 18) {
        clearInterval(timer);
        out.classList.remove('spinning');
        out.textContent = `🎉 ${winner.game.name}`;
        setTimeout(() => setNightGame(winner.game.id), 1200);
      }
    }, 100);
  }

  function setNightGame(id) {
    state.night.gameId = id;
    save();
    render();
  }

  // ----- Tab Altro -----
  let installPrompt = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  function viewMore() {
    let install;
    if (standalone()) install = '<p>✅ L\'app è installata su questo telefono.</p>';
    else if (installPrompt) install = '<button class="primary wide" data-action="install">📲 Installa sul telefono</button>';
    else if (isIos()) install = '<p>Su iPhone: apri questa pagina con <b>Safari</b>, tocca <b>Condividi</b> (il quadrato con la freccia) e poi <b>Aggiungi alla schermata Home</b>.</p>';
    else install = '<p>Dal menu del browser (⋮) scegli <b>Installa app</b> o <b>Aggiungi a schermata Home</b>.</p>';

    return `<div class="section-head"><h2>Altro</h2></div>
      <div class="stack-sm">
        <section class="card stack-sm"><h3>📲 App sul telefono</h3>${install}
          <p class="muted small">Una volta installata si apre dall'icona, a schermo intero, e funziona anche senza connessione. I dati restano su questo telefono.</p></section>
        <section class="card stack-sm"><h3>💾 Backup</h3>
          <p class="muted small">Salva i voti in un file, per non perderli se cambi telefono o cancelli i dati del browser.</p>
          <div class="row"><button class="grow" data-action="export">Salva backup</button><button class="grow" data-action="import-file">Ripristina</button></div>
          <input type="file" accept="application/json,.json" id="import-input" hidden></section>
        <section class="card stack-sm"><h3>🛒 Dati Steam</h3>
          <p class="small">${steam.updatedAt ? `Prezzi e recensioni aggiornati il ${new Date(steam.updatedAt).toLocaleDateString('it-IT')}.` : 'Prezzi indicativi: i dati live di Steam non sono ancora stati scaricati.'}</p>
          <p class="muted small">Cross-play, numero di giocatori e Game Pass cambiano nel tempo: controllate la pagina del gioco prima di comprare.</p></section>
        <section class="card stack-sm"><h3>🗑️ Ricomincia da zero</h3>
          <button class="danger wide" data-action="reset">Cancella tutti i dati</button></section>
      </div>`;
  }

  // ---------- eventi ----------
  function handleAction(btn) {
    const { action, id, game, value } = btn.dataset;
    const p = id ? player(id) : null;
    const t = ui.turn;

    switch (action) {
      case 'goto': go(value); return;
      case 'set':
        p[btn.dataset.field] = /^\d+$/.test(value) ? Number(value) : value;
        p.profileDone = true;
        save();
        break;
      case 'genre': {
        const lvl = p.genres[btn.dataset.genre] ?? 1;
        p.genres[btn.dataset.genre] = [2, 3, 0, 1][lvl];
        p.profileDone = true;
        save();
        break;
      }
      case 'emoji':
        p.emoji = EMOJIS[(EMOJIS.indexOf(p.emoji) + 1) % EMOJIS.length];
        save();
        break;
      case 'edit':
        ui.editing = ui.editing === id ? null : id;
        break;
      case 'add-player': {
        const np = defaultPlayer(state.players.length);
        state.players.push(np);
        ui.editing = np.id;
        save();
        break;
      }
      case 'remove-player':
        if (!confirm(`Rimuovere ${p.name} dal gruppo? Si perdono i suoi voti.`)) return;
        state.players = state.players.filter((x) => x.id !== p.id);
        save();
        break;
      case 'start-turn': startTurn(id); return;
      case 'profile-done':
        player(t.pid).profileDone = true;
        t.step = 'vote';
        save();
        window.scrollTo({ top: 0 });
        break;
      case 'end-turn': endTurn(); return;
      case 'turn-vote': {
        const tp = player(t.pid);
        tp.votes[t.queue[t.i]] = value;
        save();
        buzz();
        t.i++;
        if (t.i >= t.queue.length) { endTurn(); return; }
        window.scrollTo({ top: 0 });
        break;
      }
      case 'turn-own': {
        const tp = player(t.pid);
        const gid = t.queue[t.i];
        tp.owned = tp.owned.includes(gid) ? tp.owned.filter((x) => x !== gid) : [...tp.owned, gid];
        save();
        break;
      }
      case 'turn-prev': t.i = Math.max(0, t.i - 1); break;
      case 'turn-next':
        t.i++;
        if (t.i >= t.queue.length) { endTurn(); return; }
        window.scrollTo({ top: 0 });
        break;
      case 'browse': ui.browse = true; ui.handoff = null; break;
      case 'unbrowse': ui.browse = false; break;
      case 'voter': ui.voter = id; break;
      case 'vote':
      case 'own': {
        const voter = player(ui.voter) || activePlayers()[0];
        if (!voter) return;
        if (action === 'vote') {
          if (voter.votes[game] === value) delete voter.votes[game];
          else voter.votes[game] = value;
        } else {
          voter.owned = voter.owned.includes(game) ? voter.owned.filter((x) => x !== game) : [...voter.owned, game];
        }
        save();
        buzz();
        break;
      }
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
        save();
        toast('Registrata! Datele le stelline nel diario.');
        break;
      }
      case 'rate':
      case 'del-history': {
        const i = state.night.history.findIndex((h) => h.date === btn.dataset.date);
        if (i < 0) return;
        if (action === 'rate') state.night.history[i].rating = Number(value);
        else state.night.history.splice(i, 1);
        save();
        break;
      }
      case 'install':
        installPrompt.prompt();
        installPrompt.userChoice.finally(() => { installPrompt = null; render(); });
        return;
      case 'export':
        download(`attempatoni-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
        return;
      case 'import-file':
        $('#import-input').click();
        return;
      case 'reset':
        if (!confirm('Cancellare davvero tutti i dati del gruppo?')) return;
        state = defaultState();
        Object.assign(ui, { editing: null, turn: null, handoff: null, browse: false, voter: null });
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
    const appidMatch = String(fd.get('steam') || '').match(/(?:app\/)?(\d{3,})/);
    const genres = fd.getAll('genres');
    const crossplay = fd.get('crossplay') === 'on';
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
      crossplayPcXbox: crossplay,
      crossplay: crossplay ? 'Cross-play PC/Xbox (segnalato dal gruppo).' : 'Cross-play PC/Xbox non verificato.',
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
      // toccare "Vota" durante un turno non lo interrompe
      if (tabBtn.dataset.tab !== 'vota') { ui.turn = null; ui.handoff = null; }
      go(tabBtn.dataset.tab);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (btn && !btn.disabled) { e.preventDefault(); handleAction(btn); }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form === 'add-game') { e.preventDefault(); addCustomGame(e.target); }
  });

  // input testuali: salva senza ridisegnare (non perde la tastiera); il resto ridisegna
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.input === 'name') {
      player(el.dataset.id).name = el.value;
      save();
    } else if (el.dataset.input === 'groupName') {
      state.groupName = el.value || 'Serata Attempatoni';
      $('#group-title').textContent = state.groupName;
      save();
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
    if (el.id === 'import-input') {
      const file = el.files[0];
      if (!file) return;
      file.text().then((txt) => {
        const data = JSON.parse(txt);
        if (!Array.isArray(data.players)) throw new Error('formato');
        if (!confirm('Sostituire i dati attuali con quelli del backup?')) return;
        state = { ...defaultState(), ...data };
        save();
        render();
        toast('Backup ripristinato');
      }).catch(() => toast('File non valido'));
      return;
    }
    if (el.dataset.input === 'active') {
      player(el.dataset.id).active = el.checked;
      save();
    } else if (el.dataset.input === 'name' || el.dataset.input === 'groupName') {
      render(); // aggiorna le intestazioni quando si chiude la tastiera
    } else if (el.dataset.ui && el.dataset.ui !== 'search') {
      ui[el.dataset.ui] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (el.dataset.setting) {
      state.settings[el.dataset.setting] = el.checked;
      save();
    } else if (el.dataset.night) {
      state.night[el.dataset.night] = el.dataset.night === 'day' ? Number(el.value) : el.value;
      save();
    } else return;
    render();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    if (tab === 'altro') render();
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline non disponibile */ });
  }

  // Dati salvati con la versione precedente: chi aveva già votato ha il profilo fatto
  state.players.forEach((p) => {
    if (p.profileDone === undefined) p.profileDone = !!p.updatedAt || Object.keys(p.votes || {}).length > 0;
  });

  render();
})();
