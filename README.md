# 🎮 Serata Attempatoni

Web app per un gruppo di amici (pensata per 5) che vuole trovare **un gioco da fare insieme ogni settimana**, con **cross-play tra PC e Xbox**.

Nessun server, nessuna registrazione: è una pagina HTML che funziona anche aprendo `index.html` con un doppio clic.

## Cosa fa

| Tab | A cosa serve |
|---|---|
| 👥 **Gruppo** | Ognuno indica piattaforma (PC/Xbox), Game Pass, budget, generi preferiti, stile (cooperativo ↔ competitivo), complessità sopportata, riflessi e durata ideale della serata. |
| 🗳️ **Vota i giochi** | Catalogo di ~50 giochi con cross-play PC↔Xbox verificato. Ognuno vota: ❤️ Lo voglio · 👍 Ci sto · 🤷 Boh · 👎 Preferirei di no · 🚫 Veto, e segna 📦 i giochi che ha già. Filtri per genere, "ci stiamo tutti", gratis/Game Pass. |
| 🏆 **Consigliati** | Classifica per il gruppo con il punteggio di ognuno e il perché. |
| 📅 **Serata** | Giorno e ora fissi, gioco della settimana (anche estratto a sorte tra i primi 5), promemoria ricorrente per il calendario (.ics), messaggio WhatsApp con istruzioni per il cross-play, diario delle serate con le stelline. |
| 🔗 **Condividi** | Link che contiene tutti i dati del gruppo, da mandare su WhatsApp; backup su file. |

### Come viene scelto il gioco

Per ogni giocatore il gioco prende un punteggio 0-100 da: affinità con i generi, stile di gioco, complessità e riflessi richiesti (penalità se superano quanto dichiarato), durata, costo (zero se lo possiede o se il suo Game Pass lo copre) e voto esplicito.

Il punteggio di gruppo è **60% media + 40% del giocatore meno contento**: vince il gioco che va bene a tutti, non quello che entusiasma tre e annoia due. Un 🚫 veto esclude il gioco. Sono esclusi anche i giochi dove non ci state tutti nella stessa partita (attivabili con "Includi giochi dove dovete dividervi"). I giochi fatti nelle ultime due serate scendono un po' per variare.

### Come si usa in gruppo

1. Uno apre l'app, scrive i nomi nel tab **Gruppo** e manda il link dal tab **Condividi**.
2. Ognuno apre il link, sceglie "Io sono…" in alto, compila il suo profilo, vota e rimanda il link.
3. Chi riceve un link aggiornato lo apre e preme "Aggiorna i miei dati": per ogni giocatore vale la versione più recente, quindi nessuno sovrascrive gli altri.

## Dati da Steam

Il catalogo è curato a mano in [`js/games.js`](js/games.js), perché Steam non dice se il cross-play include Xbox. Lo script [`scripts/update-steam.mjs`](scripts/update-steam.mjs) interroga lo store Steam (nessuna chiave API) e scrive [`data/steam-data.js`](data/steam-data.js) con:

- prezzo attuale in euro e sconti, immagini, descrizione, % di recensioni positive;
- l'appid dei giochi del catalogo che non lo hanno ancora;
- i **più venduti su Steam con multiplayer multipiattaforma** che non sono nel catalogo: compaiono in fondo al tab "Vota i giochi" e si possono aggiungere al vostro catalogo con un clic dopo aver verificato il cross-play con Xbox.

```bash
npm run update-steam   # richiede Node 18+
```

Su GitHub lo fa da solo ogni lunedì il workflow [`update-steam.yml`](.github/workflows/update-steam.yml).

## Pubblicarla online (gratis)

Con GitHub Pages: in **Settings → Pages** scegliete "GitHub Actions" come sorgente. Il workflow [`pages.yml`](.github/workflows/pages.yml) pubblica il ramo `main` a ogni modifica e dopo ogni aggiornamento dei dati Steam. Il link da mandare al gruppo sarà `https://<utente>.github.io/app-attempatoni/`.

In locale: `npm start` (oppure aprite `index.html`).

## Sviluppo

- Nessuna dipendenza e nessun build: HTML, CSS e JavaScript.
- `npm test` esegue i test della logica di punteggio e la coerenza del catalogo.
- Per aggiungere un gioco al catalogo ufficiale aggiungete un oggetto in `js/games.js` (i campi sono documentati in cima al file).

> ⚠️ Cross-play, numero di giocatori e presenza nel Game Pass cambiano nel tempo: prima di comprare, controllate la pagina del gioco.
