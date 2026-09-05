# Unique Document Intelligence Engine

Un file caricato smette di essere un allegato e diventa una catena tracciabile:
**file → testo → dati strutturati → intuizioni → decisione di una persona.**
Ogni anello resta in archivio, e resta collegato al precedente.

Vive in `src/lib/document-intelligence/`, si innesta sul Brain esistente e non
lo duplica.

---

## La pipeline

```
CARICAMENTO           documents/caricamento.ts
    ↓ validazione      dimensione, ruolo, paziente
    ↓ riconoscimento   rilevatore.ts       ← i byte, non il nome
    ↓ apertura         lettore.ts          → pdf / word / excel / immagine
    ↓ OCR              ocr.ts              ← solo immagini e scansioni
    ↓ layout, tabelle  tabelle.ts
    ↓ normalizzazione  normalizzatore.ts + catalogo.ts
    ↓ dati clinici     estrattore-medico.ts
    ↓ stato e fiducia  stato.ts
    ↓ JSON strutturato processore.ts
    ↓ BRAIN            brain/documento.ts  ← trend, intuizioni, proposte
    ↓ REVISIONE UMANA  documents/actions.ts
```

Ogni riga è un file, e ogni file si può sostituire senza toccare gli altri: il
contratto fra le fasi è in `tipi.ts`.

**Il confine che conta è fra `lettore.ts` e `processore.ts`.** Tutto ciò che ha
bisogno del server — `pdfjs`, la rete per l'OCR, il pacchetto di riconoscimento
locale — sta da una parte. Tutto ciò che **decide cosa entra in una cartella
clinica** sta dall'altra, dove un test può provarlo senza aprire un file. È il
motivo per cui la parte più delicata del modulo è anche quella più coperta.

---

## Le tre regole

**1. Non si inventa niente.** Un valore che non si legge esce come `null` con la
ragione scritta. `Glucosio 1?5 mg/dL` non diventa né 105 né 125: diventa un
biomarcatore senza valore, con `richiede_verifica` acceso e confidenza sotto lo
0,5. Un numero inventato che entra in cartella non si distingue più da uno vero,
e nessuno lo ricontrolla proprio perché sembra normale.

**2. L'intervallo del laboratorio vince.** Quando il referto stampa i propri
valori di riferimento, sono quelli il metro: dipendono dal metodo, dallo
strumento e dalla popolazione, e due laboratori danno intervalli diversi per lo
stesso esame avendo entrambi ragione sul proprio. Il catalogo di Unique
interviene solo dove il documento tace, e ogni valore porta scritto in
`ref_source` con quale dei due è stato giudicato.

**3. Fatto, interpretazione e inferenza restano distinti.** Non è una
convenzione: sono tabelle diverse.

| | dove vive | cosa porta con sé |
|---|---|---|
| **Fatto** | `document_biomarkers` | la citazione dal documento |
| **Interpretazione** | colonna `state` | l'intervallo con cui è stata fatta |
| **Inferenza** | `document_insights` | le prove su cui si fonda |
| **Proposta** | `document_recommendations` | il vincolo che serve una firma |
| **Decisione** | `document_reviews` | il nome di chi l'ha presa |

---

## Formati

| Formato | Come si legge | Note |
|---|---|---|
| PDF nativo | `pdf.ts`, testo + coordinate | riconosce le colonne |
| PDF scansionato | OCR | rilevato dall'assenza di testo |
| PDF misto | nativo + OCR sulle sole pagine-immagine | fiducia pesata sui caratteri |
| JPG / PNG / WebP | OCR | è il caso della foto da telefono |
| DOCX | `word.ts`, OOXML | titoli, elenchi, tabelle, revisioni escluse |
| DOC 97-2003 | `word.ts`, CFB + piece table | testo ricostruito, fiducia 0,9 |
| XLSX | `excel.ts`, OOXML | stringhe condivise, date, formule |
| XLS 97-2003 | `excel.ts`, BIFF8 | record RK, MULRK, LABELSST, FORMULA |
| CSV | `excel.ts` | separatore dedotto, RFC 4180 |

**Nessuna dipendenza nuova.** `zip.ts`, `cfb.ts` e `xml.ts` sono scritti in casa,
sopra `node:zlib`. Non è artigianato per gusto: i byte che passano da lì sono
referti medici, e ogni pacchetto di terze parti è codice non letto che li tocca,
con una superficie di aggiornamento — transitivi compresi — più grande della
funzione che sostituisce. Il lavoro vero lo fa comunque `zlib`, che è dentro Node.

Il lettore XML non risolve entità esterne e non legge il DOCTYPE. Su un file
caricato da un paziente non è una limitazione: è la difesa contro l'attacco che
si costruisce esattamente lì.

---

## OCR

Un registro di motori, in `ocr.ts`. Nessuno è obbligatorio e il sistema dichiara
quando non ne ha nessuno, invece di fingere di aver letto.

| Motore | Quando | Dove gira | Cosa legge |
|---|---|---|---|
| `modello` | `UNIQUE_BRAIN=ollama` o `anthropic` | server della clinica, o esterno | immagini; con `anthropic` anche PDF scansionati |
| `tesseract` | `UNIQUE_OCR=tesseract` | in locale, senza rete | immagini |
| `assente` | nessuno dei due | — | niente: dichiarato, il file resta in cartella |

**Stato attuale: `UNIQUE_OCR=tesseract`.** Il riconoscimento gira in locale, non
esce niente dalla clinica e non serve nessuna chiave. La scelta è scritta
esplicitamente e non lasciata al valore predefinito: così nessun referto uscirà
mai per essere letto, nemmeno se un domani qualcuno impostasse una chiave.

Il prezzo è che un **PDF scansionato** resta non letto — è un'immagine dentro un
contenitore, e tesseract riceve immagini. Le foto scattate col telefono, che
sono il caso più frequente per un paziente, si leggono. Per coprire anche le
scansioni serve `UNIQUE_BRAIN=anthropic`, che però manda il documento fuori e
cambia insieme copilot, briefing e Content Brain: è una decisione di
riservatezza prima che tecnica.

L'ordine predefinito, a `UNIQUE_OCR` vuoto, prova il modello e poi il
riconoscimento locale. `UNIQUE_OCR=nessuno` lo spegne del tutto.

Il motore locale usa l'API a **worker** e chiede `blocks: true`. Non è un
dettaglio: la scorciatoia `recognize()` restituisce una confidenza sola per
tutta la pagina, mentre serve quella **riga per riga** — su una scansione storta
la prima metà del foglio si legge benissimo e l'ultima riga no, ed è lì che sta
il valore che conta. È la fiducia che `leggiNumero` usa per abbassare un valore
letto su una riga incerta.

Il modello, quando è lui a leggere, riceve **istruzioni di trascrizione, non di
interpretazione**: copia riga per riga, separa le colonne con due spazi, e scrive
`?` dove non legge. L'interpretazione è il mestiere del codice deterministico a
valle, e mescolare le due cose renderebbe impossibile sapere quale delle due ha
sbagliato.

`tesseract.js` scarica i dati di lingua (`ita`, `eng`) alla prima lettura e li
tiene in cache. Sulla prima richiesta dopo un avvio a freddo aggiunge qualche
secondo.

---

## Il catalogo

`catalogo.ts` conosce circa novanta biomarcatori con i loro sinonimi italiani e
inglesi, l'unità canonica, gli intervalli, le soglie critiche e le conversioni.

⚠️ **Gli intervalli sono una struttura di lavoro, non un riferimento
clinicamente validato.** Vanno confermati dal team medico prima di qualunque uso
reale — la stessa avvertenza di `lib/score/metrics.ts`, e per la stessa ragione.
Il rischio è però molto più contenuto di quanto sembri, per via della regola 2:
su un referto vero il metro è quasi sempre quello stampato sul referto.

**Perché è separato da `score/metrics.ts`.** Quello contiene le trentasette
metriche che *calcolano il Longevity Score*, con pesi e curve: aggiungerci la
ferritina o il TSH cambierebbe il punteggio di ogni paziente. Un referto contiene
quaranta esami e il punteggio ne usa dieci; gli altri trenta sono dati clinici
veri che vanno letti, mostrati e seguiti nel tempo — semplicemente non entrano in
una formula. Il campo `metricCode` è il ponte fra i due cataloghi.

### Conversioni

Solo quelle matematicamente determinate: `valore × fattore + offset`. Il glucosio
fra mmol/L e mg/dL sta in un rapporto fisso perché dipende dalla massa molare, e
quella non cambia. Un'unità che non è né quella attesa né una convertibile **non
si converte**: il numero resta com'è e la fiducia crolla sotto 0,4, perché quasi
sempre significa che si è letta la riga sbagliata.

L'unico caso con intercetta è l'emoglobina glicata (IFCC ↔ NGSP). Applicare
l'offset prima del fattore darebbe 5,0 al posto di 7,0: un paziente sano al posto
di uno diabetico. C'è un test che lo difende.

---

## Stati

`OPTIMAL · NORMAL · BORDERLINE · LOW · HIGH · CRITICAL · UNKNOWN`

L'ordine dei controlli in `stato.ts` non si può invertire: **la soglia critica
viene prima di tutto**, perché un potassio a 6,5 è un'emergenza qualunque cosa
dica l'intervallo stampato sul foglio.

`UNKNOWN` non è un ripiego: è la risposta onesta quando non esiste un intervallo
con cui confrontare il numero. Un valore dichiarato «normale» sulla base di un
riferimento che non esiste sarebbe una rassicurazione inventata.

Mandano in revisione `CRITICAL`, `LOW` e `HIGH`. `BORDERLINE` no: è dentro
l'intervallo, e mandare in coda ogni valore vicino a un estremo la riempirebbe
fino a renderla inutile — che è il modo in cui le code di revisione smettono di
funzionare.

---

## Analisi temporale

`brain/documento.ts`, deterministica. Un trend è aritmetica: tre numeri e due
differenze. Chiedere a un modello se 18 → 29 → 37 stia migliorando introdurrebbe
un'incertezza dove non ce n'era, e il giorno in cui sbaglia non si potrebbe
spiegare perché.

`IMPROVING · WORSENING · STABLE · FLUCTUATING · UNKNOWN`

La funzione che rende generale tutto il resto è `distanzaDaObiettivo`. Per l'LDL
migliorare significa scendere, per l'HDL salire, per il TSH avvicinarsi al mezzo:
tre regole diverse che diventano una sola se invece della direzione si misura la
**distanza dall'intervallo obiettivo**. Migliorare è ridurre quella distanza —
sempre, per ogni esame, senza sapere da che parte stia il bene.

Due difese contro i falsi trend:

- ogni esame ha una **variabilità attesa** (`VARIABILITA`). 88 → 92 di glicemia è
  lo stesso valore misurato due volte, e chiamarlo peggioramento insegnerebbe a
  non guardare più i trend;
- con tre o più misure si contano i **cambi di direzione**: due passi avanti e
  uno indietro è `FLUCTUATING`, non un miglioramento scegliendo gli estremi che
  fanno comodo.

Senza un obiettivo il movimento si registra ma non si giudica.

---

## Database

Tutto additivo. `document_analyses` e `measurement_proposals` continuano a
funzionare come prima: il nuovo motore ci scrive dentro **insieme** alle proprie
tabelle, perché la coda di revisione delle misure che alimenta il Longevity Score
è già costruita, testata e usata.

| Tabella | Cosa contiene |
|---|---|
| `document_extractions` | una lettura completa, con il testo integrale e il JSON |
| `document_biomarkers` | un fatto per riga, con citazione e intervallo |
| `document_notes` | farmaci, integratori, conclusioni del referto |
| `document_insights` | le inferenze, con le prove |
| `document_recommendations` | le proposte, con la decisione del professionista |
| `document_reviews` | la firma su un'analisi |
| `document_audit` | ogni passaggio, con valore prima e dopo |
| `patient_biomarker_history` | **vista** su documenti + misure validate |

Colonne nuove su `documents`: `file_hash`, `processing_state`,
`processing_error`, `page_count`, `source_format`, `processed_at`.

Lo storico è una **vista** e non una tabella, come `patient_timeline`: i valori
esistono già altrove, e duplicarli vorrebbe dire tenerli allineati per sempre.

### Chi vede cosa

| | care team | paziente |
|---|---|---|
| il file originale | ✅ sempre | ✅ sempre |
| stato della lavorazione | ✅ | ✅ |
| valori estratti | ✅ | dopo che una persona ha guardato il documento |
| intuizioni | ✅ | idem |
| raccomandazioni | ✅ | **solo dopo che sono state decise** |
| chi ha revisionato | ✅ | ✅ |
| registro completo | ✅ | ❌ |

Il paziente vede i propri documenti da sempre — `documents_select` e la policy
sullo storage usano entrambe `can_access_patient`, che comprende il paziente
stesso e il suo care team. Mancava l'interfaccia, non il permesso.

I *valori letti dalla macchina* aspettano invece che qualcuno li abbia guardati.
Non è paternalismo: un referto scansionato storto produce valori sbagliati con la
faccia di valori veri, e chi legge «Ferritina 8, sotto l'intervallo» di sera non
ha modo di sapere che il motore ha letto male una cifra. Il file, la data e lo
stato si vedono comunque, così nessuno resta a chiedersi se il caricamento sia
andato a buon fine.

Le **raccomandazioni** hanno la policy più stretta di tutte, ed è la più
importante: una proposta generata da una macchina, letta da un paziente prima che
un medico l'abbia confermata, è indistinguibile da un consiglio clinico.

---

## Duplicati

`file_hash` è lo SHA-256 del contenuto. Il nome non serve — lo stesso referto
arriva come `analisi.pdf` dal paziente e come `Rossi_Mario_12032026.pdf` dal
laboratorio — e la dimensione nemmeno.

Il documento duplicato **entra comunque**. Chi ricarica lo stesso referto quasi
sempre lo fa perché non è sicuro che il primo sia arrivato: rifiutarlo con un
errore gli confermerebbe il dubbio invece di risolverlo. Si segnala, non si
rianalizza — il risultato sarebbe identico — e decide una persona.

---

## Sicurezza

- Bucket privato, **nessun URL pubblico**. `GET /api/documenti/[id]` verifica
  l'accesso via RLS, registra la lettura in `audit_log` e restituisce un
  collegamento firmato che vive **cinque minuti**: il tempo di aprire il file,
  non di conservarlo.
- Un documento non accessibile risponde **404, non 403**: dire «esiste ma non
  puoi» è già dire qualcosa su un dato sanitario.
- `document_audit` non ha policy di insert. L'unica strada è
  `log_document_event`, che è security definer: un registro che il registrato può
  riscrivere non è un registro.
- Nei log applicativi non finisce nessun valore clinico — solo conteggi,
  confidenze e codici di errore.
- Il formato si decide dai byte: un eseguibile rinominato `.pdf` non arriva mai
  al lettore di PDF.

---

## Variabili d'ambiente

| Variabile | Effetto |
|---|---|
| `UNIQUE_BRAIN` | `proprio` (predefinito), `ollama`, `anthropic` |
| `UNIQUE_OCR` | `modello`, `tesseract`, `nessuno` — senza, prova entrambi |
| `ANTHROPIC_API_KEY` | serve solo con `UNIQUE_BRAIN=anthropic` |
| `SUPABASE_SERVICE_ROLE_KEY` | senza, i documenti caricati dai pazienti non si analizzano da soli |

**Nessuna è obbligatoria.** Senza niente configurato il motore legge PDF nativi,
Word, Excel e CSV, riconosce i biomarcatori, calcola stati e trend e produce
intuizioni. Quello che manca senza OCR sono le immagini e le scansioni, e il
sistema lo dice invece di tentare.

`UNIQUE_OCR` va impostata **anche su Vercel** perché valga in produzione, e le
variabili entrano in un deployment quando viene costruito: cambiarla non tocca
quelli già online.

Le pagine che parlano di cosa il motore sa leggere — la cartella documenti del
paziente e la coda di revisione — chiedono la risposta a `motoreOcrAttivo()`
invece di dedurla dal modello linguistico acceso. Sono due cose diverse da
quando il riconoscimento può girare in locale, e confonderle significa far
ricaricare a mano referti che il sistema avrebbe letto.

---

## Cosa il sistema non fa

Non prescrive farmaci e non modifica terapie. `requires_clinical_approval` è
vincolato a `true` nel database, non è un valore predefinito: la regola sta lì
perché un domani qualcuno potrebbe scrivere in quella tabella da un percorso che
non passa dall'applicazione.

Non nomina malattie. «Coerente con una carenza» non è una diagnosi; «il paziente
ha una carenza» lo sarebbe, e c'è un test che verifica che le raccomandazioni non
contengano verbi esecutivi.

Non attribuisce un documento a un paziente leggendone il nome. Il nome sul
referto serve a **verificare** — «questo documento è intestato a un'altra
persona» — mai a identificare.
