# Sicurezza di Unique OS

Unique OS tratta cartelle cliniche, referti, terapie e comunicazioni fra
professionisti sanitari. Questo documento descrive **come è costruita la
sicurezza, cosa è verificato, e cosa non lo è.**

> **Unique OS non è dichiarato «sicuro» né «conforme».** Passare i controlli
> automatici significa che le proprietà descritte qui sotto reggono *contro i
> casi che qualcuno ha pensato di scrivere*. Non sostituisce un penetration test
> indipendente, né una valutazione d'impatto svolta da chi ha titolo per farla.
> La sezione [Prima della produzione](#prima-della-produzione) elenca ciò che
> resta da fare, ed è la parte più importante del documento.

**Data dell'ultimo audit:** 7 settembre 2026.

---

## L'idea che regge tutto

**Il frontend non è una barriera di sicurezza, e in Unique non fa finta di
esserlo.**

Ogni controllo che decide *chi vede cosa* sta nella Row Level Security di
Postgres. L'interfaccia decide cosa *mostrare*, e se sbagliasse mostrerebbe un
riquadro vuoto — non dati altrui. Le due cose vanno tenute distinte anche a
parole: nel codice si trova scritto più volte «questo non è un controllo di
accesso», ed è deliberato.

La conseguenza pratica: **chi bypassasse completamente l'applicazione e parlasse
direttamente a PostgREST con il proprio token otterrebbe esattamente le stesse
righe.** È la proprietà che i controlli in `npm run db:verifica -- seed` provano,
aprendo sessioni `authenticated` reali su un Postgres vero.

---

## L'audit, per area

| Area | Stato | Rischio residuo | Dove |
| --- | --- | --- | --- |
| Autenticazione | ✅ | Basso | `src/proxy.ts`, `src/lib/auth-actions.ts` |
| Sessione e token | ✅ | Basso | `getClaims()` nel proxy: firma verificata, non creduta |
| MFA / secondo fattore | ⚠️ | **Medio** — attivo ma non obbligatorio | `src/lib/auth.ts`, `/verifica` |
| RBAC | ✅ | Basso | `CONTROL_SECTIONS`, funzioni `is_*()` in SQL |
| Row Level Security | ✅ | Basso | 184 policy; nessuna tabella scoperta |
| Multi-struttura | ⚠️ | **Non applicabile oggi** — struttura singola | vedi [Multi-tenancy](#multi-tenancy) |
| Storage documenti | ✅ | Basso | bucket privati, URL firmati a 10 minuti |
| API e server action | ✅ | Basso | autenticazione dalla sessione, mai dal client |
| Validazione input | ⚠️ | Medio-basso | Zod ai confini AI/integrazioni, non ovunque |
| XSS | ✅ | Basso | zero `dangerouslySetInnerHTML` in tutta la codebase |
| Cookie di sessione | ⚠️ | **Medio** — `HttpOnly` disattivato per necessità | vedi [Cookie e sessione](#11-cookie-e-sessione) |
| CSRF | ✅ | Basso | server action Next (token d'origine) + `SameSite` |
| Security headers | ✅ | Basso | CSP con nonce, HSTS, COOP — `src/lib/sicurezza/intestazioni.ts` |
| Rate limiting | ⚠️ | **Medio** — in memoria, per istanza | `src/lib/sicurezza/freno.ts` |
| Audit log | ✅ | Basso | catena di impronte, immutabile per trigger |
| Segreti | ✅ | Basso | nessuno nel repository, nessuno nel client |
| Dipendenze | ✅ | Basso | `npm audit`: 0 vulnerabilità in produzione |
| AI | ✅ | Basso | copilota, non decisore; nessuna scrittura autonoma |
| OCR | ✅ | Basso | conferma umana obbligatoria prima della cartella |
| Backup | ❌ | **Alto** — mai ripristinati | vedi [Prima della produzione](#prima-della-produzione) |

---

## 1. Autenticazione

Supabase Auth. Password oppure link via email, e le due strade servono a persone
diverse: chi entra ogni giorno vuole una password, chi entra due volte l'anno non
se la ricorderebbe.

**L'identità la stabilisce il server, sempre dal token.** Il proxy usa
`getClaims()`, che **verifica la firma** con la chiave pubblica del progetto:
il cookie non viene creduto sulla parola — sarebbe `getSession()`, ed è la
ragione per cui non si usa.

**Enumerazione degli account:** la risposta è identica che l'indirizzo esista o
no, sul link di accesso e sulla reimpostazione. Dire «questa email non è
registrata» permetterebbe a chiunque di scoprire chi è paziente della clinica.
Anche il messaggio del rate limit è muto sull'esistenza dell'account.

**Redirect aperti:** il parametro `next` accetta solo percorsi interni
(`destinazione()`), e `//host` è escluso esplicitamente.

### Secondo fattore

TOTP, con iscrizione da `/pro/sicurezza`. I layout di area clinica, control room
e app paziente richiedono `aal2` e rinviano a `/verifica`.

**Chi un fattore non ce l'ha entra lo stesso, ed è deliberato.** Un blocco duro
chiude fuori chi deve ancora configurarlo, e la prima volta che succede a un
medico alle otto del mattino qualcuno disattiva la funzione. Renderlo
obbligatorio è **una decisione organizzativa** — da quale data, con quale
preavviso — non una riga di codice.

---

## 2. Autorizzazione e RBAC

I ruoli applicativi sono `patient`, `professional`, `reception`, `marketing`,
`admin`, `owner`, e vivono su `profiles.role`. **Il ruolo non arriva mai dal
client**: le funzioni SQL `is_staff()`, `is_direction()`, `is_reception()` lo
leggono dalla riga del profilo di `auth.uid()`.

Sopra il ruolo c'è una seconda dimensione che il ruolo non esprime: **il titolo
di cura**. `can_access_patient()` è la funzione da cui passa ogni policy clinica,
e combina care team, disciplina, sede e consulti attivi.

Tre distinzioni che il codice tiene separate di proposito:

- **Leggere una cartella** e **scriverci** — `can_access_patient` contro
  `can_write_clinical`.
- **Somministrare** e **prescrivere** — un infermiere registra ciò che ha dato,
  e non può cambiare la dose (`can_prescribe()`).
- **Vedere un valore** e **validarlo** — `can_approve_clinical_flag()`.

**Chiedere un consulto è un motivo di cura**, e apre la cartella allo specialista
per la durata del consulto più trenta giorni. Il permesso è legato all'oggetto,
finisce da sé, e ogni apertura resta nel registro.

> **Sui ruoli richiesti nell'audit** (Pharmacist, Radiology, Laboratory come ruoli
> distinti): non esistono come ruoli applicativi, ed è una scelta. La
> segmentazione operativa passa dai **reparti** (`departments`, righe non enum) e
> dalla **disciplina** del professionista, che insieme decidono cosa si vede e
> cosa si apre. Aggiungere ruoli paralleli ai reparti avrebbe prodotto due
> gerarchie da tenere allineate a mano — che è il modo in cui i permessi
> divergono.

---

## 3. Row Level Security

**184 policy. Nessuna tabella senza RLS, nessuna tabella con RLS e senza policy,
nessuna vista senza `security_invoker`.** Le tre condizioni sono verificate a
ogni esecuzione di `npm run db:verifica` e il comando esce con codice diverso da
zero se cadono.

Le funzioni `security definer` esistono dove servono — scrivere nel registro,
attraversare tabelle che il chiamante non può leggere — e sono l'eccezione
motivata, non la regola. Ognuna ripete il controllo di titolo al suo interno.

> **Una lezione che vale la pena tenere scritta.** In una di queste funzioni il
> controllo era `if not (p_patient = my_patient_id() or …)`. Per il personale
> `my_patient_id()` è `null`, quindi il confronto non era falso ma **null**, e in
> PL/pgSQL `if not null then` non entra: la guardia veniva saltata, e siccome la
> funzione è `security definer` la RLS non c'era a raccogliere l'errore. Chiunque
> poteva registrare un consenso di chiunque. Il costo del bug era un `coalesce`;
> a trovarlo è stato un test che chiedeva a un professionista estraneo di
> provarci. **In una funzione definer, ogni confronto che può dare `null` va
> chiuso con `coalesce(..., false)`.**

### Garanzie verificate su Postgres

76 controlli comportamentali con sessioni reali. I principali:

- la reception **non vede dati sanitari** — misure, referti, note, consensi;
- un professionista non del care team non vede il paziente;
- un consulto apre la cartella **solo** allo specialista interpellato;
- essere medico non basta a leggere una conversazione fra colleghi;
- il paziente non vede mai una comunicazione interna che lo riguarda;
- una manomissione del registro **si vede** (trigger disabilitato e riga alterata
  dentro il test);
- i conteggi del Command Center tornano zero a chi non ha titolo.

---

## 4. Multi-tenancy

**Unique OS è oggi un'applicazione a struttura singola, e questo va detto invece
che lasciato dedurre.**

Esistono `organizations` e `locations`, e `organization_id` è presente su alcune
tabelle. **Non compare in nessuna policy.** L'isolamento fra strutture non è
implementato — non è rotto, non c'è.

Esiste un perimetro di **sede**: `profiles.scope_location_id` più
`location_in_scope()`, applicato al ramo staff di `can_access_patient()`. È
**opt-in e permissivo**: un profilo senza perimetro vede tutte le sedi, e una
riga senza sede è visibile a tutti. Va bene per una clinica con più ambulatori
e la stessa direzione; **non basta a separare due aziende sanitarie diverse.**

Un controllo in `db:verifica` fallisce il giorno in cui viene inserita una
seconda organizzazione senza che esistano policy su `organization_id`. Non
impedisce niente: **fa rumore**, che è l'unica cosa utile quando il problema è
una migrazione futura.

**Se Unique OS deve ospitare più strutture, questo è il lavoro da fare prima, e
non è piccolo:** una colonna tenant su ogni tabella clinica, la sua presenza in
ogni policy, e un controllo che rifiuti una policy nuova che non la nomini.

### IDOR

`/pro/pazienti/123` non è sufficiente per vedere il paziente 123: la query passa
dalla policy di `patients`, che chiede `can_access_patient(id)`. La pagina non
controlla nulla — riceve zero righe e mostra «non trovato». È lo stesso
meccanismo per documenti, referti, terapie e conversazioni.

---

## 5. Dati clinici, log, URL

Zero `console.log` in tutta la codebase applicativa. I 17 `console.error`
registrano **codici** di errore, mai contenuti clinici — la password non finisce
nei log neppure come lunghezza.

Nessun dato clinico negli URL o nei query parameter: gli identificativi sono
UUID, che non dicono nulla di chi rappresentano. Nessun dato clinico in
`localStorage`. Nessun servizio di analytics di terze parti.

---

## 6. Storage documenti

Due bucket, **entrambi privati** (`public: false`):

- `patient-documents` — referti e documenti in cartella;
- `clinical-comms` — allegati nati dentro una conversazione.

L'accesso passa da policy su `storage.objects` che leggono il percorso: il primo
segmento è l'identificativo del paziente o della conversazione, e la policy
chiede lo stesso titolo che chiederebbe la tabella corrispondente.

Chi ha titolo riceve un **URL firmato che vale dieci minuti**. Non esistono URL
permanenti su documenti sanitari.

Un referto allegato a una conversazione tramite `document_id` **non viene
copiato**: i permessi restano quelli del documento. Se domani il paziente esce
dal tuo care team, l'allegato smette di aprirsi.

---

## 7. API e server action

Cinque rotte API e 24 moduli di server action. Nessuno di essi stabilisce
l'identità da un dato del client.

- `/api/documenti` e `/api/documenti/[id]` — delegano a `caricaFile` e alle
  policy; la seconda registra ogni apertura nel registro degli accessi.
- `/api/integrazioni/*` — parlano con il gestionale, **non con una persona**: si
  autenticano con `UNIQUE_SYNC_TOKEN`, confrontato a tempo costante, e usano la
  chiave di servizio. Sono l'unica superficie con privilegi elevati: il token va
  trattato come una credenziale di amministrazione.
- `/api/pazienti/[id]/esporta` — portabilità GDPR; passa da
  `export_patient_data()`, che verifica il titolo e lascia una traccia.

**CSRF:** le server action di Next verificano l'origine della richiesta, e i
cookie di Supabase sono `SameSite=Lax`. Non esistono endpoint `GET` che
modifichino stato.

**SQL injection:** nessuna query è costruita per concatenazione. Tutto passa da
PostgREST o da funzioni SQL con parametri tipati.

---

## 8. Validazione degli input

Zod è usato ai confini dove la forma dei dati **non è nostra**: risposte del
modello, payload delle integrazioni, output dell'OCR. Nelle server action la
validazione è manuale e la garanzia forte sta un livello sotto — le funzioni SQL
rifiutano ciò che non ha senso, e la RLS rifiuta ciò che non compete.

**È il punto più debole di questo audit, ed è onesto dirlo.** Non è una
vulnerabilità nota: è una superficie dove un errore futuro troverebbe meno
resistenza. Il limite del corpo delle server action è a 12 MB (i referti in PDF
superano il predefinito di 1 MB), e il caricamento rifiuta prima di leggere il
corpo, non dopo.

---

## 9. Caricamento file

**Il `Content-Type` dichiarato dal browser non viene creduto.** Il formato si
riconosce dai **magic bytes**, e il MIME registrato è quello riconosciuto, non
quello dichiarato.

Limite di dimensione verificato su `content-length` **prima** di leggere il
corpo. Nome file rigenerato, percorso costruito dal server — nessuna parte del
nome originale entra nel percorso, quindi non c'è path traversal da difendere.
I file non vengono mai eseguiti e vivono in bucket privati.

**Non c'è scansione antivirus.** Un PDF infetto caricato da un paziente resta
tale, e verrebbe scaricato da un professionista. È un rischio residuo dichiarato:
vedi [Prima della produzione](#prima-della-produzione).

---

## 10. XSS e security headers

**Zero occorrenze di `dangerouslySetInnerHTML`** in tutta la codebase. Note
mediche, messaggi, nomi, testo estratto dall'OCR e risposte del modello passano
tutti dall'escaping di React.

La Content Security Policy sta in `src/lib/sicurezza/intestazioni.ts`, ha un
**nonce nuovo a ogni richiesta**, ed è applicata a ogni risposta — rinvii
compresi. Unique non carica niente da terzi: nessuno script esterno, nessun font
remoto, nessun pixel.

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
style-src 'self' 'unsafe-inline'; connect-src 'self' https://…supabase.co wss://…;
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

**`'unsafe-inline'` sugli stili è l'unico allentamento, ed è dichiarato.** Con un
nonce presente il browser **ignora** `unsafe-inline` per specifica: la prima
versione di questa policy metteva entrambi, e il risultato erano cinquecento
violazioni in console con ogni animazione ferma — React scrive `style="…"` a ogni
render, GSAP sessanta volte al secondo. `style-src-attr` sarebbe la forma
corretta e non è riconosciuta ovunque. Uno stile iniettato non esegue codice, e
la via classica per farne un furto — un selettore che chiama un'immagine altrove
— è chiusa da `img-src` e `connect-src`. **`script-src`, che è la direttiva che
conta, non concede niente**, e un test lo verifica.

Undici test coprono la policy. Il più importante fallisce se qualcuno aggiunge
`unsafe-inline` agli script.

---

## 11. Cookie e sessione

I cookie di sessione li gestisce `@supabase/ssr` con i suoi valori predefiniti:
`Path=/`, `SameSite=Lax`, durata massima 400 giorni, **`HttpOnly` disattivato**.
Il rinnovo avviene nel proxy a ogni richiesta. **Nessun token in `localStorage`.**

> **`HttpOnly` è `false`, e va detto invece che lasciato credere.**
>
> Questo audit era arrivato a scrivere il contrario, dando per buono il valore
> che sembrava ovvio. Il predefinito di `@supabase/ssr` è
> `httpOnly: false`, e non è una svista della libreria: **il client del browser
> legge la sessione da `document.cookie`.** Unique lo usa davvero — per il
> realtime, che valuta la RLS per ogni sottoscrittore, e per l'iscrizione e la
> verifica del secondo fattore, che avvengono nel browser. Con `HttpOnly` quelle
> tre cose smettono di funzionare.
>
> **La conseguenza:** un XSS riuscito potrebbe leggere il token di sessione.
> `HttpOnly` è esattamente la difesa in profondità per il caso in cui le altre
> cadono, e qui non c'è.
>
> Cosa la sostituisce: zero `dangerouslySetInnerHTML` in tutta la codebase, una
> CSP con nonce che non concede `unsafe-inline` agli script, e nessuno script di
> terze parti da cui l'iniezione possa arrivare. Sono difese sull'*ingresso*
> anziché sull'*uscita*, e reggono finché reggono tutte e tre.
>
> Toglierlo dal tavolo si può, e non è una riga: vuol dire portare realtime e
> secondo fattore a passare da endpoint server, e togliere al browser ogni
> accesso diretto a Supabase. È un lavoro reale, ed è la voce più seria fra i
> rischi residui.

`Secure` non è imposto dall'applicazione: lo garantisce l'HSTS, che impedisce al
browser di parlare in chiaro con il dominio.

---

## 12. Rate limiting

`src/lib/sicurezza/freno.ts`. Finestra scorrevole, per contesto:

| Contesto | Limite |
| --- | --- |
| Accesso con password | 5 in 5 min |
| Link via email | 3 in 10 min |
| Reimpostazione password | 3 in 15 min |
| Ricerca pazienti | 30 in 1 min |
| Caricamento documenti | 20 in 5 min |
| Chiamate al modello | 15 in 5 min |

Sull'accesso il conteggio è **doppio**: per indirizzo IP e per email. Il primo
ferma chi prova mille password su un account; il secondo ferma chi prova la
stessa password su mille account da mille indirizzi — che è l'attacco che il
conteggio per indirizzo non vede.

> **La memoria è quella del processo.** Su Vercel ogni istanza ha la sua, e le
> istanze si moltiplicano sotto carico: chi attacca da mille indirizzi contro
> venti istanze si prende venti volte il limite. **Questo è un dosso, non un
> muro.** Il muro sta lato Supabase, che applica un limite proprio
> sull'autenticazione, condiviso fra tutte le istanze. Il giorno in cui serve
> davvero, l'interfaccia di `freno.ts` si reimplementa su un archivio condiviso
> senza toccare chi la chiama.

---

## 13. Audit log

`audit_log` è **append-only e a prova di manomissione**, non a prova di
modifica — la seconda proprietà non è ottenibile e chi la promette mente.

- Nessuna policy di insert: l'unica strada è una funzione `security definer`.
- Un trigger `before update or delete` rifiuta ogni modifica. **Un trigger e non
  una policy**, ed è tutta la differenza: le policy valgono per i client, i
  trigger valgono per chiunque — compresa la chiave di servizio, compreso il
  proprietario della tabella.
- Ogni riga porta l'impronta della precedente (`prev_hash` → `entry_hash`,
  SHA-256). `verify_audit_chain()` dice **dove** la catena si rompe.

### Cosa viene registrato

**Sessioni:** entrata, uscita, tentativo fallito, cambio password, richiesta di
reimpostazione, richiesta di link, verifica del secondo fattore riuscita e
fallita, blocco per rate limit.

**Letture cliniche:** apertura cartella, sezione, documento, punteggio,
interrogazione del copilota, briefing, esportazione.

**Scritture:** note, documenti, misure, prescrizioni, somministrazioni, ordini di
laboratorio (trigger su sei tabelle).

**Diritti:** consenso concesso e revocato, esportazione dati, cancellazione.

Ogni riga porta timestamp, attore, azione, entità, identificativo, paziente
quando pertinente, e — per gli eventi di sessione — indirizzo IP, browser ed
esito.

> **Indirizzo e browser stanno in `metadata`, non in colonne nuove, ed è una
> scelta tecnica precisa.** `audit_sigilla()` calcola l'impronta su un elenco
> definito di campi. Una colonna fuori da quell'elenco sarebbe **modificabile
> senza rompere la catena**: avremmo un indirizzo IP dentro una riga che si
> dichiara sigillata e non lo è per quel campo. `metadata` nell'impronta c'è già.

**Nessun contenuto clinico entra nel registro.** Il registro dice *che* qualcuno
ha letto una cartella, non cosa c'era scritto.

L'indirizzo IP **non decide mai un permesso**: `x-forwarded-for` lo scrive il
proxy e chiunque può inviarne uno inventato. Entra in un conteggio e in una riga,
mai in una decisione di accesso.

---

## 14. Privacy e diritti della persona

- **Minimizzazione:** il registro non contiene contenuti clinici; al modello si
  manda il necessario.
- **Portabilità (art. 20):** `export_patient_data()` e `/api/pazienti/[id]/esporta`.
- **Cancellazione (art. 17):** `erase_patient()` toglie **chi**, non **cosa** —
  nome e recapiti spariscono, la storia clinica resta. È l'art. 17 comma 3(h):
  il diritto all'oblio non cancella una cartella clinica, e un sistema che lo
  facesse violerebbe l'obbligo di conservazione.
- **Consenso:** `patient_consents` è append-only con la versione dell'informativa
  su ogni riga. Revocare **scrive una riga**, non ne cancella una.
- **Tracciamento degli accessi (art. 30/32):** vedi sopra.

**La reception non registra consensi, ed è una decisione.** `patient_consents`
dice anche a cosa una persona ha aderito — la ricerca — e la promessa «il banco
non vede dati sanitari» è verificata a ogni esecuzione della suite. Romperla per
comodità è il modo in cui una garanzia smette di valere: non con una decisione,
con un'eccezione.

---

## 15. AI

**Il modello è un copilota, mai un decisore.** L'output di un modello **non può**
modificare una terapia, una diagnosi o una cartella senza la conferma esplicita
di un operatore autorizzato — e la conferma passa dalle stesse policy di
qualunque altra scrittura.

`analizzaPaziente()` **non è generata da un modello: è assemblata da query.** La
strada breve era mandare la cartella a un modello e chiedergli otto paragrafi: un
decimo del codice, e la cosa peggiore possibile in clinica — un riepilogo
plausibile in cui un valore su venti è inventato e nessun modo di sapere quale.
Al modello resta il fondo della pagina, dove risponde con le fonti obbligatorie;
se non c'è — chiave non configurata, rete caduta — la pagina resta intera.

Le proposte del Brain passano da `brain_proposals` e da un'approvazione umana
prima di toccare qualsiasi cosa.

> **Da configurare consapevolmente:** se `ANTHROPIC_API_KEY` è impostata, il testo
> inviato al modello lascia l'infrastruttura. Va coperto da un accordo sul
> trattamento dei dati e dichiarato nel registro dei trattamenti. In alternativa
> il progetto supporta un modello locale via `OLLAMA_URL`, e in quel caso non
> esce niente.

---

## 16. OCR

Un documento caricato è **input non fidato**, e viene trattato come tale:
formato dai magic bytes, limite di dimensione, nessuna esecuzione, output
validato con Zod.

**L'OCR non scrive mai in cartella da solo.** I valori estratti diventano
`measurement_proposals` in stato `needs_review`, e diventano misure solo quando
un professionista con `can_approve_clinical_flag()` le approva. Il testo estratto
resta consultabile accanto alla proposta: chi approva vede da dove viene il
numero.

---

## 17. Segreti

Cercati nel repository: nessun segreto in chiaro, nessuno hardcoded, nessuno
esposto al client.

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` sono pubbliche per
  costruzione: la chiave anonima **non concede niente da sola**, tutto passa
  dalla RLS.
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `UNIQUE_SYNC_TOKEN` sono
  usate **solo lato server**. `scripts/imposta-env.mjs` rifiuta attivamente di
  scrivere una chiave `service_role` in una variabile pubblica.
- `.env.local` è in `.gitignore`.

**Nessuna rotazione richiesta al momento dell'audit.**

---

## 18. Dipendenze

`npm audit --omit=dev`: **0 vulnerabilità**. Nessun aggiornamento major
effettuato senza verifica di compatibilità.

---

## Prima della produzione

Questa è la parte che conta. In ordine di importanza.

### Bloccanti

1. **Provare un ripristino del backup.** Supabase esegue backup automatici e
   **nessuno li ha mai ripristinati.** Un backup non verificato è un'ipotesi, non
   un backup. Va provato su un progetto separato, cronometrando quanto ci vuole.
2. **Penetration test indipendente.** Nessuna delle garanzie di questo documento
   sostituisce qualcuno che provi a romperle senza aver letto il codice.
3. **Verifica normativa nei paesi d'uso.** In Italia: designazione del
   responsabile del trattamento verso Supabase e verso il fornitore del modello,
   registro dei trattamenti, valutazione d'impatto (i dati sanitari sono
   categoria particolare, art. 9). Non è un adempimento che si deduce dal codice.

### Da configurare su Supabase

- **Backup a frequenza adeguata** e ripristino puntuale, secondo il piano.
- **Scadenza dei JWT** e rotazione del refresh token, coerenti con la durata di
  un turno clinico.
- **Rate limit di autenticazione** — quelli lato Supabase, che sono il muro vero.
- **Configurazione SMTP** propria: il servizio predefinito ha limiti bassi e non
  è pensato per la produzione.
- **Verifica che l'API sia esposta solo su `public`** e che le tabelle di sistema
  non siano nello schema esposto.
- **Log di Supabase Auth** conservati e consultabili: il registro applicativo
  copre l'applicazione, non i tentativi che non arrivano fino a lì.

### Da configurare su Vercel

- Tutte le variabili non `NEXT_PUBLIC_` come **variabili di ambiente cifrate**,
  mai in un file committato.
- `NEXT_PUBLIC_APP_URL` valorizzata: senza, il ripiego manda ai pazienti un link
  verso il loro stesso computer.
- **Protezione del deploy** sugli ambienti di anteprima: un'anteprima parla con
  lo stesso database.
- Valutare l'iscrizione alla lista di **precarico HSTS** — la direttiva è pronta
  ma volutamente senza `preload`, perché iscriversi è difficile da revocare.

### Rischi residui dichiarati

| Rischio | Perché resta | Mitigazione oggi |
| --- | --- | --- |
| Cookie leggibile da JavaScript | Il client del browser legge la sessione: realtime e MFA | CSP con nonce, zero `innerHTML`, nessuno script terzo |
| Secondo fattore non obbligatorio | Decisione organizzativa | Attivo e imposto a chi ce l'ha |
| Rate limit per istanza | Nessun archivio condiviso | Limite Supabase a monte |
| Nessun antivirus sui file | Nessun servizio integrato | Bucket privati, nessuna esecuzione |
| Struttura singola | Multi-tenancy non implementata | Controllo che fallisce alla seconda organizzazione |
| Validazione input non centralizzata | Zod solo ai confini | RLS e funzioni SQL sotto |
| Backup mai ripristinati | Mai provato | **Nessuna** — è il primo punto sopra |

---

## Checklist per chi svilupperà su Unique OS

1. **Ogni tabella nuova nasce con RLS attiva e almeno una policy.**
   `npm run db:verifica` fallisce altrimenti.
2. **Ogni vista nasce `security_invoker`.** Una vista senza è un buco che non
   somiglia a un buco.
3. **In una funzione `security definer`, ogni confronto che può dare `null` va
   chiuso con `coalesce(..., false)`.** Vedi la lezione nella sezione 3.
4. **Non aggiungere colonne ad `audit_log`.** Non entrerebbero nell'impronta.
   Quello che serve va in `metadata`.
5. **Nessun controllo di accesso nell'interfaccia.** Se stai scrivendo
   `if (ruolo === …)` per nascondere dei dati, il controllo va nel database.
6. **Mai `dangerouslySetInnerHTML`.** Se sembra indispensabile, non lo è.
7. **Niente `unsafe-inline` in `script-src`.** Un test lo impedisce.
8. **Nessun dato clinico** in log, URL, query parameter, `localStorage` o
   analytics.
9. **Un documento caricato è input ostile** finché i suoi byte non dicono
   altrimenti.
10. **Un output del modello non scrive mai in cartella** senza conferma umana.
11. Prima di aprire un permesso «per comodità», **leggi cosa promette
    `db:verifica -- seed`.** Quelle righe sono promesse fatte a dei pazienti.

---

## Comandi

```bash
npm run db:verifica -- seed   # 76 controlli su Postgres, con sessioni reali
npm test                      # 693 test
npm run typecheck
npm audit --omit=dev
```

## Segnalare una vulnerabilità

Scrivere a chi mantiene il repository **prima** di renderla pubblica. Le
segnalazioni che riguardano dati di pazienti reali vanno trattate come incidenti:
data e ora della scoperta, cosa era accessibile, per quanto tempo. Il registro
degli accessi serve esattamente a rispondere alla terza domanda.
