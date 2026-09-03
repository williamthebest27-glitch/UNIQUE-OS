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
| **Professional App** | Medici e professionisti | 🟢 Elenco pazienti, cartella unificata, revisioni cliniche |
| **Unique Control Center** | Amministrazione e management | ⚪ Da avviare |
| **Unique Brain** | Layer AI trasversale | 🟡 Motore di ingestione documenti attivo |

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
- **Motore clinico AI** — un documento viene letto da Claude, i parametri estratti
  vengono validati da regole deterministiche, quelli clinicamente rilevanti
  finiscono in coda di revisione e lo Score si ricalcola su ciò che è approvato.
- **Schema completo** — identità, care team, Score e pilastri, biomarcatori,
  percorsi, appuntamenti, documenti, membership, registro crediti append-only,
  notifiche, audit log.
- **Design system** condiviso dai quattro livelli.

**Modalità dimostrativa.** Finché `.env.local` è vuoto l’applicazione gira su dati
di esempio, senza autenticazione, e lo dichiara con un avviso nella barra laterale.
Serve a lavorare sull’interfaccia senza dipendere dal database. Appena le chiavi
Supabase ci sono, passa da sola ai dati reali.

## Stack

- **Next.js 16** (App Router, React Server Components) e **React 19**
- **TypeScript** in modalità strict
- **Tailwind CSS v4** — i token di design vivono in `src/app/globals.css`
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
    pro/                  Area professionale (segnaposto)
    (patient)/            Patient App — barra laterale e tab bar
      dashboard/          La home descritta nella visione
      percorso/  documenti/  appuntamenti/  crediti/
    globals.css           Token di design: colori, tipografia, ombre
  components/
    ui/primitives.tsx     Card, Badge, DeltaPill, icone
    patient/              Score hero, card di sintesi, liste
    shell/                Navigazione e intestazioni di pagina
  lib/
    domain/types.ts       Modello di dominio condiviso dai quattro livelli
    score/                Pilastri, catalogo metriche, motore di calcolo, test
    brain/                Estrazione AI, validazione, approvazione, briefing
    documents/            Caricamento e classificazione dei referti
    supabase/             Client browser, client server, configurazione
    auth.ts               Profilo collegato e percorso per ruolo
    data/                 Unico punto di accesso ai dati
    mock/                 Dati dimostrativi
    format.ts             Date, orari e numeri in italiano

supabase/
  migrations/             Schema, sicurezza, cataloghi
  demo-paziente.sql       Popola un paziente di prova
docs/                     Collegamento a Supabase, modello dello Score, GDPR
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
- [Documenti, timeline e cartella](docs/documenti-e-cartella.md) — caricamento,
  Health Timeline, cartella unificata e sintesi pre-visita.
- [Il motore clinico AI](docs/motore-clinico-ai.md) — come un documento diventa
  misure, quali regole decidono cosa passa da un medico.
- [Sicurezza e dati sanitari](docs/sicurezza-e-gdpr.md) — modello dei permessi,
  tracciamento degli accessi e adempimenti aperti.

## Prossimi passi

1. **Validazione clinica dello Score** — pesi e curve di normalizzazione vanno
   confermati dal team medico. Le decisioni aperte sono in docs/longevity-score.md.
2. **Anamnesi strutturata** — un questionario le cui risposte alimentino
   direttamente le metriche di anamnesi e stile di vita.
3. **Control Center** — agenda, membership, crediti, incassi, KPI.
4. **Unique Brain** — interrogazione in linguaggio naturale su dati, documenti e
   procedure, con gli stessi confini di accesso della Row Level Security.
