# Unique OS

**Il cervello digitale di Unique Longevity Clinic.**

Non una web app per i pazienti, ma l’infrastruttura in cui convergono dati clinici,
Longevity Score, documenti, appuntamenti, professionisti, membership, crediti,
pagamenti, comunicazioni, CRM, marketing, procedure e analytics — con sopra un
unico layer di intelligenza artificiale.

Il principio che regge ogni scelta tecnica di questo repository:

> **Una sola infrastruttura, più interfacce, un unico cervello AI centrale.**

---

## I quattro livelli

| Livello | Chi lo usa | Stato |
| --- | --- | --- |
| **Patient App** | Il paziente | 🟢 Home completa, collegata al database |
| **Professional App** | Medici e professionisti | 🟢 Agenda, pazienti, cartella unificata, permessi per disciplina |
| **Unique Control Center** | Direzione, reception, marketing | 🟢 Control room, economia, capacità, CRM, marketing, knowledge base |
| **Unique Brain** | Layer AI trasversale | 🟢 Chat founder con strumenti, proposte e approvazioni, contenuti, copilot clinico |

I quattro livelli non sono quattro prodotti: sono quattro interfacce sullo stesso
database, con gli stessi tipi di dominio e lo stesso linguaggio visivo. Per questo
vivono in un unico progetto Next.js con route group separati, e non in repository
distinti.

## Stato attuale

- **Home del paziente** — saluto, Unique Longevity Score con anello e andamento
  storico, sei pilastri, prossima visita, percorso attivo, crediti, azioni
  consigliate, documenti nuovi, messaggi e progressi ottenuti.
- **Sezioni Percorso, Documenti, Appuntamenti e Crediti**, sugli stessi componenti.
- **Autenticazione senza password** — link di accesso via email, sessione rinnovata
  a ogni richiesta, rotte protette, smistamento per ruolo dalla radice.
- **Dati reali da Supabase** — tutte le query della home passano dal database e sono
  filtrate dalla Row Level Security.
- **Longevity Score calcolato, non inserito** — sette pilastri, una trentina di
  parametri da undici fonti, curve di normalizzazione, copertura dei dati
  dichiarata e algoritmo versionato. Motore in funzioni pure, con 37 test.
- **Health Timeline** — punteggi, visite, documenti e percorsi in ordine cronologico,
  ricostruiti da una vista sulle tabelle di dominio.
- **Caricamento documenti** — dal paziente e dal professionista, con classificazione,
  estrazione dei parametri e segnalazione automatica al care team.
- **Cartella paziente unificata** — anagrafica, Score e sottoscore, visite, documenti,
  percorso, azioni, note e timeline in una schermata sola, con la sintesi pre-visita
  fondata solo sui dati che chi la chiede ha diritto di vedere.
- **Area professionale** — agenda del giorno, documenti nuovi, task, pazienti da
  rivalutare, e permessi differenziati per disciplina: un valore fuori soglia
  clinica lo approva un medico, e a imporlo è il database.
- **Copilot clinico** — risponde sui dati in cartella dichiarando sempre le fonti,
  e vede solo ciò che vede chi lo interroga.
- **Membership completa** — piano, stato, rinnovo, metodo di pagamento e i crediti
  in quattro numeri distinti: assegnati, utilizzati, prenotati, disponibili.
- **Credit engine** — macchina a stati nel database: prenotazione, visita svolta,
  disdetta e mancata presentazione muovono il credito da soli, da qualunque
  strada arrivi la modifica. Ogni passaggio lascia una riga nel registro.
- **Pagamenti e avvisi** — incassi, tentativi, fallimenti e recuperi, con avvisi
  automatici all’amministrazione. Il numero della carta non entra mai nel database.
- **Prenotazioni** — il paziente vede, prenota e disdice; il gestionale esistente
  sincronizza agende e disponibilità da un endpoint dedicato.
- **Control Center** — KPI di giornata e di mese, unit economics per servizio,
  professionista e paziente, compensi ricostruibili riga per riga, capacità e
  proiezioni di crescita, CRM con imbuto e valore per campagna.
- **Next Best Action** — regole cliniche e commerciali tenute separate per
  costruzione, ciascuna con i fatti che l’hanno attivata.
- **Customer journey** — lo stato di ogni persona derivato dai fatti, non da un
  campo aggiornato a mano.
- **Motore clinico AI** — un documento viene letto da Claude, i parametri estratti
  vengono validati da regole deterministiche, quelli clinicamente rilevanti
  finiscono in coda di revisione e lo Score si ricalcola su ciò che è approvato.
- **Schema completo** — identità, care team, Score e pilastri, biomarcatori,
  percorsi, appuntamenti, documenti, membership, registro crediti append-only,
  notifiche, audit log.
- **Unique Brain, interfaccia founder** — si apre una chat e si chiede come sta
  andando Unique. Il modello non conosce i numeri: li chiede, con otto strumenti
  che passano tutti dalla Row Level Security. Sotto ogni risposta restano scritte
  le chiamate, così si vede che il fatturato viene da una query e non da una stima.
- **Dalle informazioni alle azioni** — il Brain propone, non esegue. Ogni azione
  passa da anteprima, autorizzazione ed esecuzione, che sono tre gesti separati;
  la classe dell’azione sta in un catalogo scritto a mano, non nei parametri che
  il modello passa. Cambiare un prezzo aggiorna listino e knowledge base nella
  stessa operazione.
- **Knowledge base versionata** — la memoria aziendale con versione, date di
  validità, proprietario e stato. Si legge da una vista sola, che restituisce ciò
  che è vero **oggi**: il prezzo di ieri resta leggibile, ma non risponde più.
- **Marketing intelligence** — campagne, spesa, creatività e contenuti collegati
  a lead, pazienti, membership e incassi. CPL, CAC, ROAS e qualità dei pazienti
  portati, con le medie pesate e i rapporti non calcolabili dichiarati tali.
- **Content Brain** — caroselli, script, landing e campagne scritti sul brand
  book e sul listino in vigore. Un prezzo che non trova nelle fonti non lo
  inventa, e ogni bozza esce con le fonti e con ciò che un medico deve rileggere.
- **Task e notifiche** — un elenco solo per tutta Unique, con incaricato,
  priorità, scadenza e origine; tre livelli di notifica in cui l’informativo
  finisce nel digest del mattino e non suona mai.
- **Eventi di dominio** — ogni fatto rilevante lascia una riga append-only, e da
  lì esce firmato verso i sistemi collegati. È ciò che rende possibili le
  automazioni senza doverle prevedere una per una.
- **Sedi e ruoli** — Organization → Location → Professional → Patient dal primo
  giorno, e due ruoli operativi (reception, marketing) che non vedono dati
  sanitari: le policy elencano ciò che possono leggere, così una tabella nuova
  nasce invisibile a entrambi.
- **La Signature** — il Longevity Score come organismo generativo in WebGL, unico
  per ogni paziente, la cui forma è derivata dai sette pilastri. Cambia mentre la
  salute cambia. Con l’anello come ripiego dove WebGL manca o il movimento è ridotto.
- **Design system** condiviso dai quattro livelli: Fraunces e Inter, scroll con
  peso, reveal misurati. Una sola mossa audace, tutto il resto quieto.

**Modalità dimostrativa.** Finché `.env.local` è vuoto l’applicazione gira su dati
di esempio, senza autenticazione, e lo dichiara con un avviso nella barra laterale.
Serve a lavorare sull’interfaccia senza dipendere dal database. Appena le chiavi
Supabase ci sono, passa da sola ai dati reali.

## Stack

- **Next.js 16** (App Router, React Server Components) e **React 19**
- **TypeScript** in modalità strict
- **Tailwind CSS v4** — i token di design vivono in `src/app/globals.css`
- **Fraunces e Inter** via `next/font`, e un motore di movimento senza dipendenze
- **Supabase** — Postgres, autenticazione e storage, in regione UE
- Nessuna libreria di grafici: anello dello Score e sparkline sono SVG scritti a
  mano, così restano leggeri, accessibili e coerenti col resto del design

## Struttura

```
src/
  proxy.ts                Sessione e rotte protette (in Next 16 era middleware.ts)
  app/
    page.tsx              Smistamento per ruolo
    accedi/               Accesso con link via email
    auth/callback/        Atterraggio del link ricevuto
    pro/                  Area professionale
    control/              Control Center — oggi, brain, agenda, economia,
                          capacità, crm, task, approvazioni, marketing,
                          contenuti, conoscenza
    api/integrazioni/     Prenotazioni dal gestionale, feed eventi e webhook
    (patient)/            Patient App — barra laterale e tab bar
      dashboard/          La home descritta nella visione
      percorso/  documenti/  appuntamenti/  crediti/
    globals.css           Token di design: colori, tipografia, ombre
  components/
    ui/primitives.tsx     Card, Badge, DeltaPill, icone
    patient/              Score hero, card di sintesi, liste
    shell/                Navigazione e intestazioni di pagina
    motion/               Reveal, testo mascherato, provider del motore
    patient/signature.tsx La Signature: shader WebGL con ripiego
  lib/
    domain/types.ts       Modello di dominio condiviso dai quattro livelli
    score/                Pilastri, catalogo metriche, motore di calcolo, test
    brain/                Estrazione AI, briefing, copilot, chat founder,
                          strumenti, Content Brain
    approvals/            Catalogo azioni, anteprime, esecuzione, ciclo delle
                          proposte, con test
    knowledge/            Knowledge base: validità nel tempo, ricerca, versioni
    marketing/            CPL, CAC, ROAS, qualità dei contenuti, con test
    events/               Catalogo eventi, emissione, webhook firmati, con test
    documents/            Caricamento e classificazione dei referti
    clinical/             Note, valutazioni, proposte di percorso, task
    professionals/        Discipline e ambiti di competenza
    credits/              Regole di disdetta e movimenti
    appointments/         Prenotazione, disdetta, esito della visita
    economics/            Unit economics e compensi, con test
    capacity/             Capacità, saturazione e proiezioni, con test
    journey/              Stato del percorso, derivato dai fatti
    nba/                  Next Best Action: regole cliniche e commerciali
    supabase/             Client browser, client server, configurazione
    auth.ts               Profilo collegato e percorso per ruolo
    data/                 Unico punto di accesso ai dati
    mock/                 Dati dimostrativi
    format.ts             Date, orari e numeri in italiano

supabase/
  migrations/             Schema, sicurezza, cataloghi, knowledge base, eventi
  demo-paziente.sql       Popola un paziente di prova
  demo-clinica.sql        Turni e lead
  demo-marketing.sql      Campagne, spesa, creatività, contenuti
  assegna-ruolo.sql       Dà a un utente il suo ruolo
docs/                     Collegamento a Supabase, Brain, knowledge base, GDPR
```

## Avvio locale

```bash
npm install
npm run dev
```

L’applicazione risponde su <http://localhost:3000>. Senza variabili d’ambiente parte
in modalità dimostrativa e non serve altro.

Verifica dei tipi e test del motore di calcolo:

```bash
npm run typecheck
npm test
```

## Collegare il database

Procedura completa in **[docs/collegare-supabase.md](docs/collegare-supabase.md)**:
creazione del progetto in regione UE, migrazioni, configurazione dell’accesso,
chiavi, primo utente e dati di prova.

Un punto che vale la pena ripetere qui: le query dell’applicazione **non filtrano
per paziente**. Ci pensa la Row Level Security. Se una query fosse sbagliata,
Postgres non restituirebbe comunque righe che l’utente non ha diritto di vedere.
È una rete di sicurezza deliberata, che regge anche a un errore di programmazione.

## Documentazione

- [Collegare Supabase](docs/collegare-supabase.md) — dalla modalità dimostrativa al
  database reale, passo per passo.
- [Il modello dell’Unique Longevity Score](docs/longevity-score.md) — come è composto
  il punteggio e quali assunzioni vanno validate clinicamente.
- [Il design](docs/design.md) — la Signature, la tipografia, il movimento e
  dove il movimento non va.
- [Control Center, CRM e capacità](docs/control-center.md) — journey, Next Best
  Action, unit economics, compensi e proiezioni di crescita.
- [Crediti, pagamenti e prenotazioni](docs/crediti-pagamenti-prenotazioni.md) —
  la macchina a stati del credito, gli avvisi di incasso, l’integrazione col
  gestionale.
- [Professionisti, copilot e membership](docs/professionisti-e-membership.md) —
  permessi per disciplina, assistente contestuale, crediti e piani.
- [Documenti, timeline e cartella](docs/documenti-e-cartella.md) — caricamento,
  Health Timeline, cartella unificata e sintesi pre-visita.
- [Il motore clinico AI](docs/motore-clinico-ai.md) — come un documento diventa
  misure, quali regole decidono cosa passa da un medico.
- [Unique Brain](docs/unique-brain.md) — gli strumenti, la memoria, e il confine
  fra dire e fare: proposta, anteprima, autorizzazione, esecuzione.
- [La knowledge base e il tempo](docs/knowledge-base.md) — perché
  un’informazione ha una versione, e come si sa quale è vera oggi.
- [Marketing intelligence e Content Brain](docs/marketing-e-contenuti.md) —
  attribuzione, CPL, CAC, ROAS, e come nasce un contenuto che rispetta il brand.
- [Sicurezza e dati sanitari](docs/sicurezza-e-gdpr.md) — modello dei permessi,
  segregazione dei ruoli, tracciamento e adempimenti aperti.

## Prossimi passi

1. **Validazione clinica dello Score** — pesi e curve di normalizzazione vanno
   confermati dal team medico. Le decisioni aperte sono in docs/longevity-score.md.
2. **Confermare la knowledge base** — listino, membership e procedure sono state
   scritte dal brief del founder e portano la nota che lo dichiara. Vanno rilette
   dall’amministrazione, e ogni voce vuole un proprietario: senza, invecchia
   senza che nessuno se ne accorga.
3. **Anamnesi strutturata** — un questionario le cui risposte alimentino
   direttamente le metriche di anamnesi e stile di vita.
4. **Canali di comunicazione** — WhatsApp, email e Meta. Oggi il Brain *prepara*
   i contatti e non ne manda nessuno; l’invio sarà un’azione a sé, con la sua
   classe e la sua approvazione.
5. **Importare la spesa pubblicitaria** — `campaign_daily_stats` si popola a mano
   o dall’endpoint di integrazione. Servono le credenziali Meta e Google.
6. **Tracciare l’origine dei lead** — perché l’attribuzione sia completa, moduli
   e landing devono passare i parametri di campagna. Finché non lo fanno, i
   numeri di CAC e ROAS vanno letti sapendo che coprono solo una parte.
7. **Pagamenti** — collegare un gestore esterno: stato, rinnovo e incassi oggi
   si compilano a mano, ma lo schema e gli avvisi sono già pronti.
8. **Popolare `audit_log`** — gli eventi dicono cosa è cambiato; manca il
   tracciamento di chi ha *guardato* un dato clinico.
