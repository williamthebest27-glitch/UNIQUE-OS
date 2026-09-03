# Collegare Supabase

Procedura completa per passare dalla modalità dimostrativa al database reale.
Richiede una decina di minuti.

Finché `.env.local` è vuoto l’applicazione gira su dati di esempio e mostra un
avviso "modalità dimostrativa" nella barra laterale. Quando le chiavi ci sono,
passa da sola al database: non c’è nessun interruttore da girare.

---

## 1. Creare il progetto — in regione UE

Su [supabase.com](https://supabase.com) crea il progetto scegliendo **Frankfurt**
o **Ireland**.

La regione **non è modificabile dopo la creazione**. Unique OS tratta dati relativi
alla salute, categoria particolare ai sensi dell’art. 9 del GDPR: un progetto creato
per errore negli Stati Uniti va rifatto da zero.

## 2. Applicare le migrazioni

Dal progetto, apri **SQL Editor** ed esegui i file di `supabase/migrations/`
**nell’ordine dei loro numeri**, uno alla volta:

1. `20260903100000_core_schema.sql` — tabelle, indici, viste, trigger
2. `20260903100100_rls_policies.sql` — Row Level Security e bucket dei documenti
3. `20260903110000_view_security_and_enrollment_steps.sql`
4. `20260903110100_seed_catalog.sql` — percorsi e livelli di membership
5. `20260903120000_measurements_and_clinical_ai.sql` — misure, analisi AI,
   proposte in revisione
6. `20260903130000_timeline_uploads_briefings.sql` — Health Timeline, caricamento
   dal paziente, briefing pre-visita
7. `20260903140000_professionals_membership_copilot.sql` — discipline e permessi,
   note, task, membership completa, copilot
8. `20260903150000_credit_engine_payments_booking.sql` — credit engine, pagamenti,
   servizi, disponibilità, integrazione col gestionale
9. `20260903160000_crm_economics_capacity.sql` — CRM, identità omnicanale,
   prezzi e regole di compenso, ambulatori e orari

In alternativa, con la Supabase CLI installata e il progetto collegato:

```bash
supabase db push
```

### Provarle prima, in locale

Prima di incollare qualcosa nella SQL Console conviene eseguirla su un
Postgres vero:

```bash
npm run db:verifica
```

Applica tutte le migrazioni in ordine su un Postgres in WebAssembly — niente
Docker, niente server — e poi controlla le tre cose che non possono
sbagliare: che ogni tabella abbia la Row Level Security accesa, che abbia
almeno una policy, e che ogni vista sia `security_invoker`. Con
`npm run db:verifica -- seed` esegue anche i dati dimostrativi.

Serve a scoprire qui, e non a metà di una migrazione già in corso su
Supabase, errori come quello di `create or replace view`, che in Postgres
può solo aggiungere colonne in fondo: rinominarle o riordinarle richiede di
eliminare la vista e ricrearla.

> **Se il secondo file si ferma sulle policy dello storage** — in alcuni progetti
> `storage.objects` non è modificabile via SQL. Esegui il resto del file e crea le
> due policy dall’interfaccia, in *Storage → patient-documents → Policies*, usando
> le stesse espressioni che trovi in fondo alla migrazione. Il bucket deve restare
> **privato**.

## 3. Configurare l’autenticazione

In **Authentication → Providers** verifica che **Email** sia attivo.

In **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` in sviluppo, il dominio reale in produzione.
- **Redirect URLs**: aggiungi `http://localhost:3000/auth/callback` e l’equivalente
  di produzione.

Senza il secondo, il link ricevuto via email non riporta all’applicazione.

## 4. Copiare le chiavi

In **Project Settings → API** trovi i due valori. Mettili in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Motore clinico AI. Senza, l’applicazione funziona ma non analizza documenti.
ANTHROPIC_API_KEY=sk-ant-...
```

La **anon key** è pubblica per definizione: finisce nel bundle del browser ed è
giusto così. Ciò che protegge i dati non è la chiave, è la Row Level Security.

La **service-role key** scavalca la RLS. Va tenuta fuori dal codice client e **non
va mai prefissata con `NEXT_PUBLIC_`**. Serve a un caso solo: analizzare un
referto caricato dal paziente, che non può scrivere lui stesso analisi e
proposte. Puoi lasciarla vuota — il documento verrà salvato lo stesso e lo
analizzerà un professionista dalla cartella.

Riavvia `npm run dev`: le variabili d’ambiente vengono lette all’avvio.

## 5. Creare il primo utente

I pazienti **non si registrano da soli**: li apre la clinica. Il codice usa
`shouldCreateUser: false`, quindi un indirizzo sconosciuto non crea alcun account.

In **Authentication → Users → Add user** inserisci un indirizzo email reale a cui
hai accesso. Un trigger crea automaticamente il profilo applicativo con ruolo
`patient`.

## 6. Popolare i dati di prova

L’utente appena creato ha un profilo ma nessuna scheda clinica: accedendo vedrà
"Ci siamo quasi". Per avere una home completa, apri `supabase/demo-paziente.sql`,
sostituisci l’email in cima ed eseguilo nella SQL Editor.

Lo script crea scheda paziente, una trentina di misure su due rilevazioni, lo
storico dello Score con i sette pilastri, percorso attivo, membership, crediti,
appuntamento, documenti, azioni e notifiche.
Si può rieseguire: azzera e ricrea i dati di prova di quel paziente.

I punteggi seminati sono quelli che il motore calcola davvero da quelle misure.
Per verificarlo, apri `/pro/revisioni` con un account professionale e premi
**Ricalcola punteggio**: devono restare identici.

Se vuoi vedere anche il medico di riferimento nella card della prossima visita, crea
un secondo utente e indica la sua email nella variabile `v_pro_email` dello script.

Poi esegui `supabase/demo-clinica.sql`: crea i turni del professionista — senza,
la capacità non è misurabile — e una manciata di lead per il CRM.

## 7. Accedere

Vai su <http://localhost:3000>, inserisci l’email e apri il link che ricevi.
Il badge "modalità dimostrativa" sparisce: da lì in poi i dati arrivano dal database.

---

## Come funziona l’accesso

Nessuna password. `signInWithOtp` invia un collegamento a scadenza breve: più sicuro
di una password che il paziente riuserebbe altrove, e toglie a Unique l’onere di
custodirla.

Il messaggio mostrato dopo l’invio è identico che l’indirizzo esista o no. Dire
"questa email non è registrata" permetterebbe a chiunque di scoprire chi è paziente
della clinica.

Il file `src/proxy.ts` — in Next 16 il vecchio `middleware.ts` — rinnova il token a
ogni richiesta e tiene fuori chi non ha effettuato l’accesso. Non decide *quali*
dati si possono vedere: quello lo fa la Row Level Security, dove non è aggirabile.

## Se qualcosa non funziona

**"Il link non è più valido"** — il collegamento è già stato usato o è scaduto, oppure
manca `/auth/callback` fra le Redirect URLs del punto 3.

**Non arriva l’email** — con il servizio SMTP predefinito Supabase limita fortemente
il numero di invii. Per l’uso reale va configurato un SMTP proprio in
*Authentication → Emails*.

**Vedo "Ci siamo quasi"** — l’account esiste ma non ha una scheda paziente: manca il
passo 6.

**Vedo ancora "modalità dimostrativa"** — `.env.local` non è compilato, oppure il
server non è stato riavviato dopo averlo compilato.

**La home resta vuota con i dati caricati** — quasi certamente la Row Level Security
sta facendo il suo mestiere: stai guardando con un account diverso da quello a cui
appartengono i dati.

**"cannot change name of view column"** — è il modo in cui Postgres dice che una
vista sta cambiando forma. `create or replace view` sa solo aggiungere colonne in
fondo: se cambiano nome o ordine, la vista va eliminata e ricreata. Le migrazioni
in repo lo fanno già; se lo incontri su una nuova, aggiungi
`drop view if exists public.<nome>;` prima del `create view`. Un `create or
replace` che fallisce non lascia nulla a metà: la migrazione si ferma e basta
rieseguirla dopo la correzione.
