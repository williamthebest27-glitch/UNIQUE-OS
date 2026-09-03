# Unique OS

**Il cervello digitale di Unique Longevity Clinic.**

Non una web app per i pazienti, ma l infrastruttura in cui convergono dati clinici,
Longevity Score, documenti, appuntamenti, professionisti, membership, crediti,
pagamenti, comunicazioni, CRM, marketing, procedure e analytics — con sopra un
unico layer di intelligenza artificiale.

Il principio che regge ogni scelta tecnica di questo repository:

> **Una sola infrastruttura, più interfacce, un unico cervello AI centrale.**

---

## I quattro livelli

| Livello | Chi lo usa | Stato |
| --- | --- | --- |
| **Patient App** | Il paziente | 🟢 Home operativa su dati dimostrativi |
| **Professional App** | Medici e professionisti | ⚪ Da avviare |
| **Unique Control Center** | Amministrazione e management | ⚪ Da avviare |
| **Unique Brain** | Layer AI trasversale | ⚪ Da avviare |

I quattro livelli non sono quattro prodotti: sono quattro interfacce sullo stesso
database, con gli stessi tipi di dominio e lo stesso linguaggio visivo. Per questo
vivono in un unico progetto Next.js con route group separati, e non in repository
distinti.

## Stato attuale

Costruito e funzionante:

- **Home del paziente** — saluto, Unique Longevity Score con anello e andamento
  storico, sei pilastri, prossima visita, percorso attivo, crediti, azioni
  consigliate, documenti nuovi, messaggi e progressi ottenuti.
- **Sezioni Percorso, Documenti, Appuntamenti e Crediti** — navigabili, costruite
  sugli stessi componenti.
- **Design system** — palette, tipografia e componenti condivisi dai quattro livelli.
- **Schema del database** — tabelle, indici e viste per identità, Score, biomarcatori,
  percorsi, appuntamenti, documenti, membership, crediti, notifiche e audit.
- **Row Level Security completa** — le regole di accesso ai dati sanitari.

Non ancora collegato:

- Autenticazione reale (i dati della home sono dimostrativi, in
  `src/lib/mock/patient-dashboard.ts`).
- Il progetto Supabase: le migrazioni sono scritte ma non ancora applicate.

Tutta l interfaccia legge da `src/lib/data/patient.ts`. Quando Supabase sarà
collegato si sostituisce il corpo di quelle funzioni e **nessun componente cambia**.

## Stack

- **Next.js 16** (App Router, React Server Components) e **React 19**
- **TypeScript** in modalità strict
- **Tailwind CSS v4** — i token di design vivono in `src/app/globals.css`
- **Supabase** — Postgres, autenticazione e storage, in regione UE
- Nessuna libreria di grafici: anello dello Score e sparkline sono SVG scritti a mano,
  così restano leggeri, accessibili e coerenti col resto del design

## Struttura

```
src/
  app/
    (patient)/            Patient App — layout con barra laterale e tab bar
      dashboard/          La home descritta nella visione
      percorso/  documenti/  appuntamenti/  crediti/
    layout.tsx            Layout radice, metadati, viewport
    globals.css           Token di design: colori, tipografia, ombre
  components/
    ui/primitives.tsx     Card, Badge, DeltaPill, icone
    patient/              Score hero, card di sintesi, liste
    shell/                Navigazione e intestazioni di pagina
  lib/
    domain/types.ts       Modello di dominio condiviso dai quattro livelli
    data/                 Unico punto di accesso ai dati
    mock/                 Dati dimostrativi, da rimuovere a collegamento fatto
    format.ts             Date, orari e numeri in italiano

supabase/migrations/      Schema e policy di sicurezza
docs/                     Modello dello Score, sicurezza e dati sanitari
```

## Avvio locale

```bash
npm install
npm run dev
```

L applicazione risponde su <http://localhost:3000> e reindirizza alla home del
paziente. Per ora non serve alcuna variabile d ambiente: i dati sono dimostrativi.

Verifica dei tipi:

```bash
npm run typecheck
```

## Collegare Supabase

1. Creare un progetto Supabase **in regione UE** (Francoforte o Irlanda). Non è un
   dettaglio: la piattaforma tratta dati relativi alla salute, categoria particolare
   ai sensi dell art. 9 del GDPR.
2. Copiare `.env.example` in `.env.local` e compilare le chiavi.
3. Applicare le migrazioni nell ordine in cui sono numerate, dalla SQL Console del
   progetto o con la Supabase CLI:

   ```bash
   supabase db push
   ```

4. Sostituire l implementazione delle funzioni in `src/lib/data/patient.ts`.

Le query dell applicazione **non filtrano per paziente**: ci pensa la Row Level
Security. Se una query fosse sbagliata, Postgres non restituirebbe comunque righe
che l utente non ha diritto di vedere. È una rete di sicurezza deliberata.

## Documentazione

- [Il modello dell Unique Longevity Score](docs/longevity-score.md) — come è composto
  il punteggio e quali sono le assunzioni da validare clinicamente.
- [Sicurezza e dati sanitari](docs/sicurezza-e-gdpr.md) — modello dei permessi,
  tracciamento degli accessi e adempimenti aperti.

## Prossimi passi

1. **Autenticazione** — login del paziente e smistamento per ruolo dalla radice.
2. **Collegamento a Supabase** — sostituire i dati dimostrativi con quelli reali.
3. **Professional App** — elenco pazienti, scheda clinica, caricamento referti.
4. **Control Center** — agenda, membership, crediti, incassi, KPI.
5. **Unique Brain** — interrogazione in linguaggio naturale su dati, documenti e
   procedure, con gli stessi confini di accesso della Row Level Security.
