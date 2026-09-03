# Documenti, timeline e cartella unificata

Tre pezzi che si reggono a vicenda: il paziente carica un referto, il sistema lo
classifica e lo mette in fila nella sua storia, il professionista lo ritrova in
una cartella sola invece che in dieci PDF.

---

## Health Timeline

Tutta la storia clinica in ordine cronologico: punteggi, visite, documenti,
inizio e fine dei percorsi.

È una **vista**, `patient_timeline`, non una tabella. Gli eventi esistono già
nelle tabelle di dominio: duplicarli in un registro parallelo vorrebbe dire
tenerli allineati per sempre, e prima o poi un percorso di scrittura se ne
dimentica. Una vista non può andare fuori sincrono con sé stessa.

`security_invoker = true` propaga la Row Level Security delle tabelle sorgente:
nella timeline ognuno vede esattamente ciò che vedrebbe altrove.

La timeline compare nella sezione **Percorso** del paziente e in fondo alla
cartella clinica del professionista — stessa componente, stessi dati.

## Caricamento documenti

Caricano sia il paziente, dalla sezione Documenti, sia il professionista, dalla
cartella. Formati accettati: PDF, PNG, JPEG e WebP fino a 11 MB — sono quelli
che il motore sa anche leggere.

Dopo il salvataggio, in automatico:

1. il file va nel bucket privato, sotto la cartella del paziente;
2. il documento viene registrato in cartella;
3. il motore lo **classifica** e ne **estrae i parametri**;
4. la data del referto viene letta dal documento stesso;
5. l’evento compare nella timeline;
6. il care team viene **avvisato**.

Se l’analisi fallisce — modello non configurato, referto illeggibile, chiave
mancante — **il file resta caricato**. Perdere il referto per un errore dell’AI
sarebbe il peggiore dei risultati possibili.

### Tre dettagli di permessi

**Il paziente può aggiungere, non riscrivere.** La policy
`documents_patient_upload` concede il solo `insert`, e solo sulla propria
scheda: una cartella clinica non si riscrive dopo.

**La categoria non la chiediamo davvero.** Il menu parte da "non lo so": il
motore riconosce il tipo da solo, e domandarlo al paziente sarebbe scaricare su
di lui un lavoro che il sistema sa fare. Una classificazione scelta da una
persona non viene mai sovrascritta.

**Il paziente non scrive analisi.** `document_analyses` e
`measurement_proposals` richiedono permessi clinici: un valore estratto male non
deve poter spaventare nessuno prima che un professionista lo abbia guardato. Ma
allora chi analizza un referto caricato dal paziente?

L’autorizzazione viene verificata **prima**, con il client di sessione del
paziente: se la Row Level Security non restituisce il documento, la cosa finisce
lì. Solo dopo, su un documento già verificato come suo, la scrittura passa dalla
chiave `SUPABASE_SERVICE_ROLE_KEY`. È l’unico punto del progetto in cui quella
chiave viene usata, ed è usata per scrivere, mai per decidere chi vede cosa.

Senza quella chiave l’applicazione funziona lo stesso: il documento viene
salvato, il care team avvisato, e l’analisi la avvia un professionista dalla
cartella.

### Segnalare al professionista

Un paziente non può scrivere notifiche ad altri profili, e non deve poterlo
fare. La funzione `notify_care_team()` è l’unica eccezione: `security definer`,
ma con un controllo `can_access_patient()` in cima e la scrittura ristretta ai
professionisti con assegnazione attiva su quel paziente.

## Cartella unificata

In `/pro/pazienti/[id]`, in una schermata sola: anagrafica, care team, Score e
sette sottoscore con la copertura dei dati, prossima visita, percorso attivo,
crediti, documenti con caricamento e analisi, azioni consigliate, note e
timeline. In cima, se ci sono valori in attesa, un rimando alle revisioni.

## "Riassumimi questo paziente prima della visita"

Il pulsante in cima alla cartella genera una sintesi della storia del paziente.

**Fondata solo sui dati disponibili.** Le query passano dal client di sessione
di chi la chiede: è la Row Level Security a decidere cosa entra nel prompt. Un
medico non può ottenere per interposto modello ciò che non potrebbe leggere da
sé.

**Verificabile.** Il modello ha istruzione di portare valore e data dietro ogni
affermazione quantitativa — "glicata 5,2% ad agosto", non "buon controllo
glicemico" — di dire "non risulta" invece di colmare i vuoti, e di non
formulare diagnosi né proporre terapie. Un pilastro non calcolabile per dati
mancanti diventa una cosa da verificare in visita, non un risultato.

**Conservata.** Ogni briefing finisce in `patient_briefings` con il modello
usato, chi l’ha chiesto, quando, e su quanto materiale è stato scritto. Così è
rileggibile a posteriori sapendo cosa il modello aveva davanti — e non si paga
due volte la stessa domanda.

## Da fare

1. **Anteprima dei documenti.** Oggi si vede il titolo; manca il link firmato per
   aprire il file dallo Storage.
2. **Anamnesi strutturata.** La cartella mostra un campo note libero. L’anamnesi
   prevista dalla visione merita un questionario proprio, le cui risposte
   alimentino direttamente le metriche di `anamnesis` e `questionnaire`.
3. **Visite passate.** La cartella mostra la prossima; lo storico completo delle
   visite è in timeline ma non ancora in una sezione dedicata.
4. **Filtri sulla timeline.** Con anni di storia servirà poter isolare i soli
   punteggi, o i soli referti.
