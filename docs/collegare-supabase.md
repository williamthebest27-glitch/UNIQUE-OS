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
10. `20260904100000_organizations_locations_roles.sql` — organizzazione e sedi,
    ruoli reception e marketing, perimetro di sede
11. `20260904100100_domain_events.sql` — eventi di dominio e webhook in uscita
12. `20260904110000_knowledge_base.sql` — knowledge base versionata, con i primi
    contenuti di brand, listino e procedure
13. `20260904120000_marketing.sql` — campagne, spesa, creatività, contenuti e
    attribuzione
14. `20260904130000_brain_approvals_tasks.sql` — conversazioni e memoria del
    Brain, approvazioni, task unificati, notifiche con gravità

### Oppure tutte insieme, in un incollaggio solo

Quattordici file uno alla volta sono quattordici occasioni per saltarne uno.

```bash
npm run db:pacchetto
```

Unisce tutte le migrazioni in `supabase/locale/migrazioni-da-applicare.sql`
— cartella ignorata da Git — **dopo** averle eseguite per intero, in una
transazione sola, su un Postgres vero. Se il pacchetto viene scritto, regge;
se non regge, non viene scritto e ti dice dove si è fermato.

Poi: *SQL Editor → New query*, incolla, Run. L'ultima riga del file è un
controllo che restituisce quante tabelle, viste e policy sono in piedi, e
quante tabelle sono rimaste senza Row Level Security — che devono essere zero.

Su un database che ha già le prime migrazioni, includi solo quelle nuove:

```bash
npm run db:pacchetto -- --da 10
```

Per sapere da quale numero ripartire, esegui `supabase/stato-migrazioni.sql` nella
SQL Editor: è di sola lettura, elenca le quattordici migrazioni una per una e
dice qual è la prima che manca. Supabase non tiene un registro delle migrazioni
incollate a mano — lo tiene solo quando si usa la CLI — quindi l'unico modo di
saperlo è guardare quali oggetti esistono.

> `ERROR: 42710: type "app_role" already exists` significa esattamente questo: il
> pacchetto conteneva migrazioni già applicate. Essendo una transazione sola,
> non è stato applicato niente e lo schema è rimasto com'era.

`create table` non è ripetibile: rieseguire una migrazione già applicata
fallisce, e siccome il pacchetto è una transazione sola, fallisce tutto.

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
`npm run db:verifica -- seed` esegue anche i dati dimostrativi e verifica la
**segregazione dei ruoli**: entra come marketing e come reception con i permessi
veri di `authenticated` e controlla che nessuno dei due veda misure, referti,
note cliniche o punteggi. Che la Row Level Security sia accesa non dice che sia
giusta.

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

### Le email di accesso: da Supabase a Resend

Il servizio di posta incluso in Supabase serve solo a provare: **due email
all’ora**, senza garanzie di consegna. L’email resta la strada per la prima
password e per chi preferisce entrare con un link, quindi in produzione va
sostituito. Resend è una scelta ragionevole.

### La prima password

Un account creato con il link via email non ha una password: `signInWithPassword`
non ha niente con cui confrontarsi finché non se ne sceglie una.

Due strade, e la seconda non richiede che la posta funzioni:

- **Dall’applicazione** — in `/accedi`, *"Non ho una password, o non la ricordo"*.
  Arriva un collegamento che apre `/imposta-password`; da lì in poi si entra
  direttamente.
- **Dalla dashboard** — Authentication → Users → l’utente → *Reset password*, o
  impostandola a mano. Utile per il primo accesso di chi amministra, prima che
  l’SMTP sia configurato.

Il minimo è **dodici caratteri**, applicato dall’applicazione. Vale la pena
alzarlo anche nel progetto — Authentication → Policies → Password requirements —
perché quello vale per tutti, non solo per chi passa da qui.

**Su Resend**

1. *Domains → Add Domain*: aggiungi il dominio della clinica e scegli la regione
   **Ireland (eu-west-1)**. Poi inserisci nel DNS i record che ti mostra — DKIM,
   SPF e, se lo propone, DMARC. Finché il dominio non risulta *Verified* puoi
   scrivere solo a te stesso.
2. *API Keys → Create API Key*: permesso di sola spedizione. La chiave si vede
   una volta sola, e vale come una password: non finisce nel repository e non si
   incolla in chat.

**Su Supabase**, in *Authentication → Emails → SMTP Settings*, attiva il custom
SMTP e compila:

| Campo | Valore |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (TLS implicito) oppure `587` (STARTTLS) |
| Username | `resend` |
| Password | la API key di Resend |
| Sender email | un indirizzo del dominio verificato, es. `accessi@tuodominio.it` |
| Sender name | Unique Longevity Clinic |

Poi vai in *Authentication → Rate Limits*: attivando un SMTP proprio Supabase
impone comunque **30 email all’ora**, che per una clinica in attività è poco.
Alzalo a un valore sensato.

Infine, in *Authentication → Email Templates*, il modello che conta è **Magic
Link**. Riscrivilo in italiano, con il tono di Unique. Deve contenere
`{{ .ConfirmationURL }}`: è quel collegamento che riporta a `/auth/callback`.

> **Una nota che in clinica pesa.** La regione di Resend governa da dove le email
> partono, non dove restano i dati dell’account: quelli stanno negli Stati Uniti.
> L’indirizzo di un paziente è un dato personale, e il solo fatto di riceverne
> una da una clinica della longevità dice qualcosa di lui. Prima di usarlo con
> pazienti veri: firma il DPA di Resend, tienilo nel registro dei trattamenti fra
> i responsabili esterni, e non mettere **mai** informazioni cliniche nel testo
> dell’email. Il messaggio deve dire soltanto «ecco il tuo collegamento».

## 4. Copiare le chiavi

Il modo più rapido, che chiede i valori e poi prova davvero il collegamento:

```bash
npm run env:collega
```

Interroga il database con la chiave appena inserita e scrive `.env.local` solo
se ha funzionato. Se la chiave è sbagliata, o è quella segreta, lo dice invece
di lasciarti davanti a una pagina vuota.

> **Come si chiama la chiave.** I progetti Supabase recenti mostrano una
> **Publishable key** che comincia per `sb_publishable_`; quelli più vecchi la
> **anon public**, un JWT che comincia per `eyJ`. Vanno bene entrambe. Quella da
> non usare mai qui è la **secret** (`sb_secret_…`) o `service_role`: scavalca la
> Row Level Security e non deve arrivare al browser.

A mano, gli stessi valori si trovano in **Project Settings → API** e si scrivono
in `.env.local`:

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
la capacità non è misurabile — e una manciata di lead per il CRM. Infine
`supabase/demo-marketing.sql`, che aggiunge campagne, spesa giornaliera,
creatività e contenuti, e attacca i lead alla campagna che li ha prodotti: senza
quest’ultimo passaggio la catena si spezza e CAC e ROAS restano non calcolabili.

## 7. Vedere l’area clinica e il Control Center

Un account nasce sempre come `patient` e vede solo `/dashboard`. Le altre aree
vogliono un ruolo diverso, ed è lo stesso applicativo a cambiare faccia:

| Ruolo | Dove atterra | Cosa vede |
|---|---|---|
| `patient` | `/dashboard` | il proprio percorso |
| `professional` | `/pro` | agenda, cartelle dei pazienti assegnati, revisioni |
| `reception` | `/control/agenda` | agenda della sede, recapiti, incassi, CRM, task |
| `marketing` | `/control/marketing` | campagne, contenuti, lead, knowledge base |
| `admin` / `owner` | `/control` | tutto: Brain, KPI, CRM, economia, capacità |

Reception e marketing non vedono dati sanitari, e non è una scelta
dell’interfaccia: le policy elencano una per una le tabelle che possono leggere,
così una tabella nuova nasce invisibile a entrambi.

Crea un **secondo utente** in *Authentication → Users → Add user*, poi apri
`supabase/assegna-ruolo.sql`, compila email e ruolo, ed eseguilo nella SQL Editor.

> Non promuovere l’account con cui guardi la dashboard del paziente: ogni account
> vive in un solo livello e perderesti quella vista. Per vedere entrambe le facce
> servono due indirizzi email.

Per un professionista il ruolo da solo non basta: la Row Level Security non guarda
il ruolo, guarda il **team di cura**. Lo script lo mette nel team dei pazienti
esistenti, altrimenti entrerebbe in un’agenda vuota. Chi è `admin` o `owner` vede
tutto senza assegnazioni.

## 8. Accedere

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

**«Il servizio email non ha accettato il messaggio», codice `smtp`** — Supabase ha
provato a spedire e il fornitore ha rifiutato. Quasi sempre è un SMTP proprio
configurato prima che fosse pronto:

- **Resend senza dominio verificato.** Finché il dominio non è *Verified*, l’unico
  mittente ammesso è `onboarding@resend.dev`, e può scrivere **solo** all’indirizzo
  con cui ti sei registrato su Resend. A chiunque altro il messaggio viene
  rifiutato, e l’accesso non funziona per nessuno.
- **Mittente fuori dal dominio verificato.** Il campo *Sender email* deve stare sul
  dominio verificato: `accessi@tuodominio.it`, non un indirizzo Gmail.
- **Credenziali sbagliate.** Username è la parola `resend`, non la tua email; la
  password è la API key.

Il rimedio immediato è **spegnere il custom SMTP** in *Authentication → Emails*: si
torna al servizio incluso, due email all’ora, e l’accesso riprende a funzionare
subito. Riaccendilo quando il dominio è verificato.

Per vedere l’errore vero, quello che il fornitore ha risposto: *Logs → Auth Logs*
nel cruscotto Supabase, e la sezione *Emails* su Resend.

**Non arriva l’email** — con il servizio predefinito Supabase manda due email
all’ora e poi tace. Configura Resend come SMTP proprio: la ricetta è nel punto 3.
Se Resend è già configurato ma l’email non parte, guarda i log in *Emails* sul suo
cruscotto: se il dominio non è ancora *Verified*, il messaggio viene rifiutato lì e
Supabase non lo sa.

**Vedo "Ci siamo quasi"** — l’account esiste ma non ha una scheda paziente: manca il
passo 6.

**Entro nell’area clinica ma non vedo nessun paziente** — il ruolo apre la porta, il
team di cura decide cosa c’è dentro. Esegui `supabase/assegna-ruolo.sql` con
`v_tutti := true`, oppure assegna il professionista al paziente dal suo team.

**Vedo ancora "modalità dimostrativa"** o **"Supabase non ancora collegato"** — sono
lo stesso stato: `.env.local` non ha URL e chiave, oppure il server non è stato
riavviato dopo averli inseriti. Le variabili vengono lette solo all’avvio, quindi
serve fermare `npm run dev` e rilanciarlo. Per capire quale dei due casi è:

```bash
npm run env:collega
```

Mostra cosa c’è già, riprova il collegamento e scrive solo se funziona. Attenzione
al file giusto: `.env.example` è il modello e non viene letto da nessuno, quello
che conta è `.env.local` nella radice del progetto.

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
