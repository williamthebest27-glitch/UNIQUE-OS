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
| `admin` / `owner` | Tutto, con tracciamento in `audit_log` |

Tutte le policy passano da un unico punto, la funzione `can_access_patient()`.
Se la regola di accesso cambia, cambia in un posto solo. La scrittura di dati
clinici passa da `can_write_clinical()`, che esclude il paziente stesso: nessuno
può modificare il proprio referto.

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

## Già implementato

- Row Level Security su tutte le tabelle, con accesso mediato da funzioni uniche.
- Bucket dei documenti privato, con policy allineate a quelle del database.
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
5. **Autenticazione a due fattori** per i profili `professional`, `admin` e `owner`.
6. **Politica di conservazione e cancellazione** — diritto all’oblio, tempi di
   conservazione della documentazione sanitaria, esportazione dei dati su richiesta
   del paziente (portabilità, art. 20).
7. **Consensi.** Il tipo di documento `consent` è previsto nello schema; va costruito
   il flusso di raccolta e revoca, con data e versione del testo firmato.
8. **Unique Brain.** Quando il layer AI leggerà i dati clinici, dovrà rispettare gli
   stessi confini della RLS — interrogando il database con l’identità dell’utente,
   mai con la chiave service-role. È il punto in cui è più facile aprire una falla,
   e va progettato con questa consapevolezza fin dall’inizio.
