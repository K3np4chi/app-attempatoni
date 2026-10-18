# 🎮 Serata Attempatoni

Web app per un gruppo di amici (pensata per 5) che vuole trovare **un gioco da fare insieme ogni settimana**, con **cross-play tra PC e Xbox**.

Nessun server, nessuna registrazione: è una pagina HTML che funziona anche aprendo `index.html` con un doppio clic.

## È un'app per il telefono

Si installa sul telefono come una normale app (PWA): icona nella schermata Home, schermo intero, funziona anche offline. **Un solo telefono per tutto il gruppo**, che passa di mano in mano: i dati restano salvati sul telefono.

**Installarla** (serve che sia pubblicata online, vedi sotto):
- **Android (Chrome):** aprite il link → tab *Altro* → *Installa sul telefono* (oppure menu ⋮ → *Installa app*).
- **iPhone (Safari):** aprite il link → *Condividi* → *Aggiungi alla schermata Home*.

## Cosa fa

| Tab | A cosa serve |
|---|---|
| 👥 **Gruppo** | Elenco dei giocatori. Toccando un nome si apre il profilo: piattaforma (PC/Xbox), Game Pass, budget, generi preferiti, stile (insieme ↔ sfide), complessità, riflessi, durata della serata. "C'è" indica chi partecipa questa settimana. |
| 🗳️ **Vota** | **Turni di voto**: si sceglie chi vota, il telefono gli passa in mano, risponde a qualche domanda sul profilo (la prima volta) e vota i giochi **uno alla volta** con pulsanti grandi: ❤️ Lo voglio · 👍 Ci sto · 🤷 Boh · 👎 Preferirei di no · 🚫 Mai! · 📦 Ce l'ho già. I voti degli altri restano nascosti. Alla fine: "passa il telefono al prossimo". C'è anche il catalogo completo con filtri e i voti di tutti. |
| 🏆 **Classifica** | I giochi migliori per il gruppo, con il punteggio di ognuno e il perché. |
| 📅 **Serata** | Giorno e ora fissi, gioco della settimana (anche estratto a sorte tra i primi 5), promemoria settimanale nel calendario, messaggio WhatsApp con le istruzioni per il cross-play, diario delle serate con le stelline. |
| ⚙️ **Altro** | Installazione, backup su file (per cambiare telefono), azzeramento. |

### Come viene scelto il gioco

Per ogni giocatore il gioco prende un punteggio 0-100 da: affinità con i generi, stile di gioco, complessità e riflessi richiesti (penalità se superano quanto dichiarato), durata, costo (zero se lo possiede o se il suo Game Pass lo copre) e voto esplicito.

Il punteggio di gruppo è **60% media + 40% del giocatore meno contento**: vince il gioco che va bene a tutti, non quello che entusiasma tre e annoia due. Un 🚫 esclude il gioco. Sono esclusi anche i giochi dove non ci state tutti nella stessa partita (attivabili con "Includi giochi dove dovete dividervi"). I giochi fatti nelle ultime due serate scendono un po' per variare.

## Sondaggio Telegram della domenica

Ogni domenica sera un bot pubblica nel gruppo Telegram il sondaggio **"in quali sere ci sei questa settimana?"**, con le sere da lunedì a domenica (con la data) più "❌ Questa settimana salto". Si possono scegliere più sere e il voto non è anonimo, così si vede subito quale sera va bene a tutti. Se il bot è amministratore del gruppo, fissa il sondaggio in alto.

Lo pubblica GitHub Actions con il workflow [`telegram-poll.yml`](.github/workflows/telegram-poll.yml): nessun server da tenere acceso.

**Configurazione (una volta sola):**
1. Su Telegram apri **@BotFather**, scrivi `/newbot`, scegli nome e username: ti dà il **token** del bot.
2. Aggiungi il bot al gruppo (meglio come amministratore, così può fissare il sondaggio) e scrivi un messaggio qualsiasi nel gruppo.
3. Su GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nome `TELEGRAM_BOT_TOKEN`, valore il token.
4. Entro 24 ore dal punto 2: **Actions → Sondaggio Telegram della settimana → Run workflow**. Il sondaggio arriva nel gruppo e nel registro dell'esecuzione trovi l'id del gruppo: salvalo nella scheda **Variables** come `TELEGRAM_CHAT_ID`.

**Variabili facoltative** (Settings → Secrets and variables → Actions → Variables):

| Variabile | Esempio | Predefinito |
|---|---|---|
| `SERATE` | `lun,mar,gio,ven` | tutte le sere |
| `ORARIO` | `22:00` | `21:30` |
| `GIOCO` | `Sea of Thieves` | `Sea of Thieves` |

GitHub esegue le automazioni programmate in orario UTC: il sondaggio arriva verso le 20:15 con l'ora legale e verso le 19:15 con l'ora solare (a volte con qualche minuto di ritardo).

## Dati da Steam

Il catalogo è curato a mano in [`js/games.js`](js/games.js), perché Steam non dice se il cross-play include Xbox. Lo script [`scripts/update-steam.mjs`](scripts/update-steam.mjs) interroga lo store Steam (nessuna chiave API) e scrive [`data/steam-data.js`](data/steam-data.js) con:

- prezzo attuale in euro e sconti, immagini, descrizione, % di recensioni positive;
- l'appid dei giochi del catalogo che non lo hanno ancora;
- i **più venduti su Steam con multiplayer multipiattaforma** che non sono nel catalogo: compaiono in fondo al catalogo completo (tab Vota) e si possono aggiungere al vostro catalogo con un clic dopo aver verificato il cross-play con Xbox.

```bash
npm run update-steam   # richiede Node 18+
```

Su GitHub lo fa da solo ogni lunedì il workflow [`update-steam.yml`](.github/workflows/update-steam.yml).

## Pubblicarla online (gratis)

Per installarla sul telefono la pagina deve essere online in https. Con GitHub Pages: in **Settings → Pages** scegliete "GitHub Actions" come sorgente. Il workflow [`pages.yml`](.github/workflows/pages.yml) pubblica il ramo predefinito a ogni modifica e dopo ogni aggiornamento dei dati Steam. Il link da aprire sul telefono sarà `https://<utente>.github.io/app-attempatoni/`.

Sul computer, per provarla: `npm start` e aprite http://localhost:8080.

## Sviluppo

- Nessuna dipendenza e nessun build: HTML, CSS e JavaScript, più `manifest.webmanifest` e `sw.js` (service worker per l'uso offline).
- Se modificate i file dell'app, aumentate `VERSION` in `sw.js`.
- `npm test` esegue i test della logica di punteggio e la coerenza del catalogo.
- Per aggiungere un gioco al catalogo ufficiale aggiungete un oggetto in `js/games.js` (i campi sono documentati in cima al file).

> ⚠️ Cross-play, numero di giocatori e presenza nel Game Pass cambiano nel tempo: prima di comprare, controllate la pagina del gioco.
