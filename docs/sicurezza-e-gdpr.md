# Sicurezza e dati sanitari

Unique OS tratta dati relativi alla salute: **categoria particolare** ai sensi
dell’art. 9 del GDPR. Non è una web app come un’altra, e alcune scelte tecniche non
sono negoziabili. Questo documento raccoglie ciò che è già implementato e ciò che
resta da fare prima di trattare dati di pazienti reali.

## Il modello dei permessi

La regola di fondo: **è il database a decidere chi vede cosa, non l’applicazione.**

Ogni tabella clinica ha la Row Level Security attiva
(`supabase/migrations/20260903100100_rls_policies.sql`). Le query
dell’applicazione non filtrano per paziente: se una query fosse sbagliata o un
endpoint venisse chiamato con un id altrui, Postgres non restituirebbe comunque
righe non autorizzate. È una rete di sicurezza deliberata, che regge anche a un
errore di programmazione.

Chi vede cosa:

| Ruolo | Accesso |
| --- | --- |
| `patient` | Esclusivamente i propri dati |
| `professional` | Solo i pazienti assegnati, tramite `care_team_members` con assegnazione attiva |
| `reception` | Agenda, anagrafica, incassi, CRM, task. **Nessun dato sanitario** |
| `marketing` | Campagne, contenuti, lead, knowledge base, numeri aggregati. **Nessun paziente** |
| `admin` / `owner` | Tutto, con tracciamento in `audit_log` |

Per reception e marketing le policy **elencano una per una** le tabelle
accessibili, invece di escludere quelle vietate. È la differenza che conta quando
si aggiunge una tabella: nasce invisibile a entrambi, e per renderla visibile
bisogna deciderlo.

`npm run db:verifica -- seed` lo verifica a ogni esecuzione: entra come marketing
e come reception con i permessi veri di `authenticated` e controlla che nessuno
dei due veda misure, referti, note cliniche o punteggi. Che la Row Level Security
sia accesa non dice che sia giusta.

### Il perimetro di sede

`profiles.scope_location_id` limita un utente interno a una sede. Null significa
tutta l'organizzazione, ed è il caso di tutti finché la sede è una. La condizione
è dentro `can_access_patient()`, quindi vale ovunque senza riscrivere una policy
il giorno in cui chi dirige Milano non dovrà leggere i pazienti di Roma.

Tutte le policy passano da un unico punto, la funzione `can_access_patient()`.
Se la regola di accesso cambia, cambia in un posto solo. La scrittura di dati
clinici passa da `can_write_clinical()`, che esclude il paziente stesso: nessuno
può modificare il proprio referto.

## Le password

Si entra con email e password, o con un link via email: due strade per persone
diverse, e la seconda resta perché per un paziente che accede due volte l’anno è
spesso la migliore.

Le password le custodisce Supabase, non l’applicazione: qui non transitano mai in
chiaro fuori dalla richiesta che le porta, non finiscono nei log — dove va solo il
codice dell’errore — e non esiste una tabella nostra che le contenga.

Il minimo è **dodici caratteri**, non i sei che Supabase applica per impostazione
predefinita: la password di un professionista è la chiave della cartella clinica
di qualcun altro. Il controllo sta in `PASSWORD_MINIMA`, e va ripetuto nel
progetto Supabase (Authentication → Policies) perché valga anche per chi non
passa dall’applicazione.

Per cambiarla non si chiede la vecchia: a dimostrare l’identità è la sessione,
aperta dal collegamento ricevuto per posta. Chiederla in più darebbe l’impressione
di un controllo che non c’è, e chi arriva dal link una password vecchia potrebbe
non averla mai avuta.

Un messaggio d’errore non dice mai se un indirizzo è registrato: Supabase risponde
`invalid_credentials` sia per una password sbagliata sia per un utente inesistente,
e l’applicazione ripete quella stessa frase — "email o password non corretti" —
per entrambi.

## La chiave service-role

`SUPABASE_SERVICE_ROLE_KEY` **bypassa completamente la Row Level Security**. Va usata
soltanto lato server, in route handler e job di back-office, e non deve mai comparire
in codice che raggiunge il browser. Non va prefissata con `NEXT_PUBLIC_`: quel
prefisso pubblica la variabile nel bundle client.

I movimenti crediti seguono questa regola: si leggono dal client, si scrivono solo
server-side. `credit_entries` è un registro append-only — nessuna riga viene mai
aggiornata, il saldo è la somma dei movimenti. Ogni credito resta tracciabile.

## Documenti e referti

I file vivono nello Storage Supabase, nel bucket privato `patient-documents`,
organizzati come `patient-documents/<patient_id>/<file>`. Il primo segmento del
percorso è la chiave dei permessi, e le policy sullo storage riusano le stesse
funzioni delle tabelle. Il database conserva solo metadati e puntatore, così i
permessi si governano in un posto solo.

Il bucket non è pubblico: l’accesso ai file passa da URL firmati a scadenza breve.

## Tracciabilità

Due registri, e fanno due mestieri diversi.

`domain_events` è **append-only** e non ha policy di update né di delete: ciò che
è successo non si corregge, si compensa con un altro evento. Ci finiscono i fatti
— visite completate, pagamenti falliti, lead convertiti — e anche le azioni del
Brain: `brain.proposal_created`, `brain.proposal_approved`, `brain.action_executed`,
`brain.action_failed`. La domanda "chi ha cambiato il prezzo della visita il 14
settembre" ha una risposta ricostruibile per intero.

`audit_log` resta per il tracciamento degli **accessi** ai dati sanitari, che è
un'altra cosa: gli eventi dicono cosa è cambiato, l'audit chi ha guardato. È il
punto ancora aperto (vedi sotto).

## Dove finiscono i dati clinici

Da nessuna parte. Referti, misure e domande sulla cartella restano
nell'infrastruttura: li legge il lettore proprietario, li confronta il copilot
proprietario, e nessuno dei due apre una connessione verso l'esterno.

È la differenza che conta di più in questo documento. Finché l'estrazione passava
da un modello esterno, ogni referto caricato era un trasferimento di dati
particolari verso un fornitore — con accordo sul trattamento, base giuridica e
riga nel registro da mantenere. Adesso quel trasferimento non avviene, e
l'adempimento sparisce insieme al rischio.

Il modello linguistico resta disponibile per i casi che il codice non copre — un
referto scansionato, una domanda posta in modo del tutto libero — e si accende di
proposito con `UNIQUE_BRAIN=anthropic`. Accendendolo, quegli adempimenti tornano:
è una decisione, e va presa sapendolo.

## Il Brain e i confini

Il layer AI legge attraverso gli stessi confini di tutti: ogni strumento usa il
client di sessione dell'utente, quindi la Row Level Security. **Non c'è modo di
ottenere dal Brain un dato che non si potrebbe leggere da soli.**

Sul fare, il confine è un altro: la classe di un'azione (lettura, suggerimento,
reversibile, sensibile) sta in un catalogo scritto a mano, non nei parametri che
il modello passa. Un modello che potesse dichiarare "questa azione è reversibile"
avrebbe il permesso di declassare la propria azione. Le azioni sensibili le
autorizza solo la direzione, e il controllo sta anche nel database — in
`decide_proposal` — così non dipende da quale schermata è stata usata.

## Già implementato

- Row Level Security su tutte le tabelle, con accesso mediato da funzioni uniche.
- Segregazione di reception e marketing dai dati sanitari, verificata a ogni
  esecuzione di `npm run db:verifica -- seed`.
- Bucket dei documenti privato, con policy allineate a quelle del database.
- Registro eventi append-only, con le azioni del Brain tracciate una per una.
- Tabella `audit_log` per tracciare accessi e modifiche (art. 30 e 32 GDPR).
- Header di sicurezza in `next.config.ts`: `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- `robots: noindex` su tutte le pagine.
- `.gitignore` che esclude `.env.local` e qualunque dato clinico locale.

## Da fare prima dei dati reali

1. **Regione UE.** Creare il progetto Supabase a Francoforte o in Irlanda. La scelta
   della regione non è modificabile dopo la creazione del progetto.
2. **Accordo sul trattamento dei dati** con Supabase e con ogni altro fornitore che
   tocchi dati di pazienti (hosting, email, pagamenti, provider AI). Per la posta,
   se si usa **Resend**: la regione irlandese governa da dove le email partono, non
   dove restano i dati dell’account, che sono negli Stati Uniti. Serve il DPA, e il
   testo delle email non deve contenere nulla di clinico — il solo fatto che una
   persona riceva posta da una clinica della longevità è già un’informazione su di
   lei.
3. **Registro dei trattamenti** e valutazione d’impatto (DPIA): con dati sanitari su
   larga scala è verosimilmente obbligatoria.
4. **Popolare `audit_log` davvero.** La tabella esiste; vanno scritte le chiamate a
   ogni lettura e modifica di dati clinici, lato server.
5. **Autenticazione a due fattori** per i profili `professional`, `admin` e
   `owner`. Con l’accesso a password è diventata più urgente, non meno: finché
   c’era solo il link via email, entrare richiedeva l’accesso a una casella;
   adesso basta una stringa, e una stringa si riusa, si scrive su un foglio e si
   ritrova nelle violazioni altrui. Supabase supporta il TOTP: va acceso per chi
   vede dati clinici.
6. **Politica di conservazione e cancellazione** — diritto all’oblio, tempi di
   conservazione della documentazione sanitaria, esportazione dei dati su richiesta
   del paziente (portabilità, art. 20).
7. **Consensi.** Il tipo di documento `consent` è previsto nello schema; va costruito
   il flusso di raccolta e revoca, con data e versione del testo firmato.
8. **I webhook in uscita.** Gli eventi che escono da Unique OS portano
   identificativi, mai nomi — ma un `patient_id` associato a un evento
   `appointment.completed` resta un dato personale. Ogni endpoint iscritto va
   messo sotto accordo sul trattamento come qualunque altro fornitore, e la
   scelta degli eventi a cui iscriverlo va fatta al minimo necessario.
9. **Le conversazioni con il Brain.** Sono private di chi le ha avute, ma restano
   nel database: vanno incluse nella politica di conservazione, e nella
   cancellazione su richiesta se contengono riferimenti a una persona.
