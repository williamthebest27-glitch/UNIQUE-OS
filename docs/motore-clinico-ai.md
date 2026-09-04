# Il motore clinico AI

> **Aggiornamento.** Il referto lo legge un lettore proprietario, senza modello e
> senza rete. Il modello resta disponibile per i casi che il lettore non copre —
> le scansioni, soprattutto — e si accende di proposito con `UNIQUE_BRAIN=anthropic`.
>
> **Come legge.** Un referto di laboratorio italiano non è prosa: è una tabella
> con nome dell'esame, valore e intervallo di riferimento, scritta in cento
> impaginazioni diverse. Il catalogo delle metriche porta già i sinonimi con cui
> ogni esame compare su quei fogli; il lettore aggiunge il resto — ricostruisce
> le righe del PDF dalla posizione verticale dei frammenti, taglia via
> l'intervallo di riferimento prima di cercare il valore, legge i numeri
> all'italiana, converte le unità (mmol/L → mg/dL) e dichiara quanto è sicuro di
> ogni lettura.
>
> **Perché deterministico è meglio, qui.** Non per costo o per privacy — quelle
> sono ragioni vere ma vengono dopo. È che un lettore a regole sbaglia sempre
> allo stesso modo: se non riconosce un esame non lo riconosce mai, e lo si vede
> subito. Un modello lo riconosce nove volte su dieci, e la decima sbaglia in
> silenzio su un paziente che nessuno ricontrolla.
>
> **Cosa non sa fare, e lo dice.** Un referto scansionato è un'immagine: qui non
> c'è riconoscimento ottico, e il documento resta in cartella per un
> professionista invece di essere letto male.
>
> Quello che cambia è **solo chi legge**. Validazione, confronto con lo storico,
> soglie di plausibilità e la decisione su cosa richiede un medico restano lo
> stesso codice deterministico descritto qui sotto.


Quando arriva un nuovo documento, il sistema lo legge, ne estrae i parametri,
li confronta con lo storico e propone l’aggiornamento dei sottoscore.

Il principio che regge tutto il resto:

> **L’AI propone, non decide.** Supporta il professionista, non ne sostituisce
> la responsabilità clinica.

---

## Il ciclo

| # | Passo | Chi lo esegue |
| --- | --- | --- |
| 1 | Riconoscere il tipo di documento | Claude |
| 2 | Estrarre i parametri rilevanti | Claude |
| 3 | Strutturarli nel database | codice |
| 4 | Confrontarli con i dati precedenti | codice |
| 5 | Identificare le variazioni | codice |
| 6 | Proporre l’aggiornamento dei sottoscore | codice |
| 7 | Generare una sintesi | Claude |
| 8 | Suggerire approfondimenti | Claude |

**Solo l’estrazione e la scrittura in linguaggio naturale sono affidate al
modello.** Validazione, confronto e decisione su cosa entra da solo e cosa
aspetta un medico sono codice deterministico e testato: un medico deve poter
leggere la regola per cui un valore è finito in revisione, non fidarsi di un
giudizio opaco.

## Estrazione

`src/lib/brain/extraction.ts` manda il documento a **Claude Opus 5** con
structured outputs: lo schema della risposta è imposto dall’API, quindi la
forma non va verificata a mano.

Il prompt di sistema contiene il catalogo completo delle metriche con
etichette, unità attese e i sinonimi con cui compaiono sui referti italiani.
Regole imposte al modello:

- **Solo codici del catalogo.** Un parametro che non corrisponde a nulla viene
  omesso: niente codici inventati, niente accostamenti approssimativi.
- **Nessuna conversione di unità.** Il valore va riportato come sta sul
  documento; convertire è compito di chi valida.
- **`source_excerpt` verbatim.** La riga del referto da cui il valore è stato
  letto, copiata alla lettera: permette al medico di verificare senza riaprire
  il PDF.
- **Confidenza onesta.** Un valore stampato male, ambiguo o dedotto merita una
  confidenza bassa.
- **Nessuna diagnosi.** La sintesi descrive cosa contiene il documento; nulla di più.

Il catalogo è stabile fra una chiamata e l’altra ed è marcato con
`cache_control`: non si paga due volte.

## Validazione

`src/lib/brain/validation.ts` decide cosa può entrare da solo.

Una misura si applica **in automatico** solo se supera ogni controllo:
confidenza ≥ 85%, unità coerente, valore fisiologicamente plausibile, data
leggibile, nessuna soglia clinica scavalcata e variazione contenuta rispetto
alla misura precedente.

Altrimenti finisce in coda con il motivo scritto:

| Motivo | Quando |
| --- | --- |
| Lettura incerta | confidenza sotto l’85% |
| Unità diversa da quella attesa | mg/dL contro mmol/L |
| Valore oltre la soglia clinica | HbA1c ≥ 6,5%, LDL ≥ 190… |
| Variazione ampia | oltre il 30% rispetto alla misura precedente |
| Primo valore per questo parametro | manca il termine di paragone |
| Data non rilevata / incoerente | data assente, futura o di dieci anni fa |

Due valori vengono **scartati e basta**, senza finire in coda:

- **fuori dall’intervallo fisiologico** — un’HbA1c di 52 non è un paziente
  gravissimo, è 5,2 letto male;
- **codice fuori catalogo** — meglio perdere un parametro che inventarne uno.

Due dettagli che sembrano minori e non lo sono:

**L’unità si controlla prima della plausibilità.** Gli intervalli sono espressi
nell’unità attesa: una glicemia di 5,1 mmol/L, letta come mg/dL, sembrerebbe
assurda e verrebbe buttata via in silenzio. Con l’ordine giusto finisce in
revisione, dove qualcuno la converte.

**Anche il rientro sotto una soglia va rivisto.** Non solo il peggioramento: se
un LDL passa da 195 a 185, la soglia è stata attraversata e la cosa va guardata.

## Approvazione

Le proposte in coda vivono in `/pro/revisioni`. Il professionista vede il
valore, quello precedente, la variazione, la confidenza, i motivi della
revisione e la riga originale del referto. Poi approva o rifiuta.

Finché una proposta è in coda **non tocca né le misure né il punteggio del
paziente**. Alla prima approvazione la misura entra e lo Score si ricalcola.

Analisi e proposte sono invisibili al paziente: le policy di Row Level Security
su `document_analyses` e `measurement_proposals` richiedono `can_write_clinical`.
Un valore estratto male non deve poter spaventare nessuno prima che un
professionista lo abbia guardato.

## Tracciabilità

- `document_analyses` conserva l’estrazione grezza per intero, il modello usato
  e l’esito. Senza, una proposta sbagliata non sarebbe ricostruibile.
- `measurement_proposals` conserva chi ha approvato o rifiutato, quando e perché.
- `measurements` porta la provenienza di ogni valore: documento, analisi, autore,
  confidenza.

## Configurazione

Serve `ANTHROPIC_API_KEY` in `.env.local`. Senza, il motore resta spento e lo
dichiara: le proposte già in coda restano approvabili, ma non si analizzano
nuovi documenti.

## Da fare

1. **Interfaccia di caricamento.** Oggi l’analisi si avvia su un documento già
   registrato; manca il caricamento del file dalla Professional App.
2. **Fallback sui rifiuti.** Su Claude Opus 5 è disponibile il parametro
   `fallbacks`, che ripiega su un altro modello se una richiesta viene declinata.
   Non è attivo perché non compone con gli structured outputs usati qui: va
   verificato e, se compatibile, acceso.
3. **Popolare `audit_log`.** Ogni analisi e ogni approvazione dovrebbero
   lasciare traccia anche lì, non solo nelle tabelle di dominio.
4. **Conversione automatica delle unità.** Oggi un’unità diversa manda in
   revisione. Con una tabella di conversioni note, i casi ovvi
   (mmol/L → mg/dL) potrebbero risolversi da soli.
5. **Valutazione.** Prima dell’uso reale serve un banco di referti veri con
   estrazione attesa, per misurare precisione e richiamo del passo 2.
