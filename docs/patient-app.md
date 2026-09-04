# La Patient App

Il paziente entra e deve capire, senza cercare: **come sto, dove sono nel
percorso, cosa devo fare adesso.** Tutto il resto della Patient App è
subordinato a queste tre domande, e ogni schermata risponde ad almeno una.

Il principio che la governa è una catena, non un elenco di funzionalità:

> dato → informazione → prossimo passo → azione → nuovo dato

Un numero che non produce un passo è un numero che il paziente guarda una
volta e poi ignora.

---

## Le sezioni, e a quale domanda rispondono

| Sezione | Domanda |
|---|---|
| **Home** | Cosa devo fare adesso? |
| **Longevity Score** | Come sto, e da dove viene quel numero? |
| **Il tuo percorso** | A che punto sono? |
| **Il tuo piano** | Cosa mi hanno chiesto di fare? |
| **Risultati** | Cosa dicono i miei esami? |
| **Progressi** | Sto migliorando? |
| **Questionari** | Cosa devo raccontare io? |
| **Documenti** | Dove sono i miei referti? |
| **Appuntamenti** | Quando torno? |
| **Messaggi** | Come parlo con chi mi segue? |
| **Membership** | Cosa ho pagato e cosa mi resta? |
| **Chiedi a Unique** | Tutte le precedenti, a voce. |
| **Profilo e privacy** | Chi vede cosa di me? |

## Il prossimo passo

La componente più importante della home, e la più facile da sbagliare.

**Ne esce uno solo.** Non tre, non dieci. Dieci inviti all'azione su una
schermata non sono dieci opportunità: chi legge sceglie il più facile, o
non sceglie. Il resto sta sotto, in righe quiete, e sotto ci sta bene.

**Porta il motivo con sé.** Non «Prenota una visita» ma *«Ripetere il
Longevity Score — l'ultimo è di 137 giorni fa»*. È la differenza fra
un'app che dice cosa fare e una che dice perché: chi legge deve poter
verificare il perché senza fidarsi del cosa.

**Non interpreta niente.** La regola più clinica di tutte si limita a
dire che un referto è arrivato e che il medico lo sta guardando.

Il motore è in `src/lib/patient/prossimo-passo.ts`: una funzione pura, con
i suoi test, e un elenco ordinato di regole in cui **l'ordine è la
priorità**. Scriverlo così — invece di assegnare punteggi e ordinare —
rende la gerarchia leggibile da chiunque apra il file, compreso chi dovrà
cambiarla fra sei mesi.

> **Non è la Next Best Action del Control Center.** Quella
> (`src/lib/nba/rules.ts`) parla alla clinica: *«Contattare il paziente»*,
> *«Proporre la membership»*. Sono azioni che qualcun altro compie su di
> lui. Due destinatari diversi, due motori diversi, gli stessi fatti.

## Il confine clinico

Vale per tutta la Patient App, ed è la riga che separa un'app che informa
da una che pratica medicina senza titolo.

**Si può dire** che un valore sta fuori dall'intervallo di riferimento
*del laboratorio che lo ha misurato*: è riportare un fatto stampato sul
referto.

**Non si può dire** cosa quel fatto significhi per quella persona.

Nella pagina dei risultati la distinzione è scritta in fondo, in chiaro,
perché chi legge un numero fuori intervallo si spaventa e ha il diritto di
sapere subito a chi chiedere.

In `Chiedi a Unique` la stessa regola è codice: un elenco di forme di
domanda — *è grave*, *cosa significa*, *devo preoccuparmi*, *che malattia*,
*devo prendere* — valutato **prima** di ogni altra intenzione, così che
«il mio punteggio è preoccupante?» non finisca nella regola del punteggio
solo perché contiene quella parola. La risposta non è un rifiuto: è il
proprio medico, con il collegamento per scrivergli.

L'elenco è deliberatamente largo. Fra rispondere di meno e rispondere a
una domanda medica, sbagliare per difetto costa un clic in più.

## Chiedi a Unique

**Non è un modello linguistico.** Risponde con lo stesso motore
proprietario del Brain della direzione: nessuna chiave, nessuna rete,
nessun dato che esce. Con dati sanitari questa non è una preferenza
tecnica — ogni domanda mandata a un'API esterna è un trasferimento di dati
sanitari da giustificare, e qui non c'è niente da giustificare perché non
parte niente.

Tre regole, in ordine: **non interpreta** (vedi sopra), **non inventa**
(ogni risposta nasce da un fatto presente nel contesto; se il fatto manca,
la risposta è che non lo sappiamo), **non indovina** (una domanda fuori
dal suo campo riceve l'elenco di ciò che sa fare, non un tentativo).

Il contesto lo compone il server dai dati che quel paziente ha già davanti
in altre pagine — non un dato in più. Sotto ogni risposta restano scritte
le fonti.

La conversazione **non viene conservata**. Non è un limite tecnico: è la
scelta di non creare un archivio di domande sulla salute che poi andrebbe
protetto, cancellato ed esportato.

## Risultati e progressi

Che una variazione sia un miglioramento **non lo decide il segno del
numero**: lo decide la curva di normalizzazione di quella metrica, la
stessa che alimenta lo Score. La glicata che scende migliora; la massa
muscolare che scende no; una glicemia può peggiorare scendendo troppo.
Confrontiamo i valori normalizzati, così la regola vale per tutte le
metriche senza elenchi di eccezioni.

I grafici sono **SVG generati sul server**, senza librerie e senza
JavaScript: centoventi chilobyte per tracciare otto punti sono il modo più
elegante di rendere lenta una pagina che deve essere immediata.
L'aritmetica sta in `src/lib/patient/andamento.ts`, dove si verifica con un
test invece che guardando lo schermo.

Due scelte che rendono un grafico onesto:

- **La scala segue i dati, non parte da zero.** Fra 74 e 78 punti ci sono
  quattro punti di percorso; su un asse 0–100 sarebbero una linea piatta.
- **Un punto solo non diventa una linea.** Si mostra il valore e basta:
  una linea suggerirebbe una direzione che non esiste.

Il periodo sta nell'URL e non nello stato di un componente, così si può
condividere e il tasto indietro funziona. Il default è **un anno**: in una
clinica di longevità i pannelli sono trimestrali, e novanta giorni
mostrerebbero quasi sempre una sola rilevazione.

## Questionari

Ci sono cose che nessun esame del sangue misura: come dormi, quanto ti
senti sotto pressione, se le persone attorno ti sostengono.

Le domande sono un **documento in `jsonb`**, non una tabella per domanda:
cambiano in blocco, e una revisione del questionario non deve poter
riscrivere le risposte già date. Chi ha risposto ieri porta con sé le
domande di ieri, nella copia che il suo questionario si è tenuta.

Ogni domanda può dichiarare un `metric_code` del catalogo dello Score: è
il ponte perché una risposta diventi una misura. **Il ponte non lo
attraversa nessuno da solo** — serve un professionista che validi.

La percentuale di completamento e lo stato **non li calcola il client**:
un modulo che dichiara «100%» con metà risposte è un modulo, non un fatto.
Li ricalcola `save_assessment` dentro il database.

## Messaggi

La categoria non è un'etichetta di comodo: **decide chi legge**.

- Un filo **clinico** lo vedono il paziente e il suo care team.
- Uno **amministrativo** lo vede anche la reception, che è chi risponde di
  appuntamenti e fatture.

È la stessa segregazione del resto del sistema, applicata alle parole
invece che ai numeri, ed è scritta sotto il selettore in pagina: chi
scrive ha il diritto di sapere chi lo leggerà.

Un messaggio si firma sempre a proprio nome — la policy pretende che
`author_id` sia chi sta scrivendo — e il testo non si riscrive: l'unica
modifica ammessa è segnare per letto.

## Consensi

Un consenso **non si modifica: se ne registra uno nuovo.** «Ha accettato
il marketing?» è una domanda senza risposta utile se non si sa *quando* e
*quale versione* dell'informativa. La tabella è append-only come il
registro dei crediti, e la vista `consent_current` dice cosa vale oggi.

Revocare è scrivere una riga, non cancellarne una: cancellare la
concessione precedente cancellerebbe anche la prova di averla avuta.

I due consensi obbligatori — informativa privacy e trattamento dei dati
sanitari — si possono dare dall'app ma non togliere: revocarli significa
chiudere il rapporto, e non è un interruttore.

## Cosa il paziente non può cambiare

Recapiti, preferenze di notifica, consensi e le proprie risposte ai
questionari. **Nient'altro.**

Data di nascita, codice fiscale, misure, punteggi e attività del piano
sono dati di cartella: una cartella clinica non si riscrive dall'app di
chi ne è il soggetto. Lo diciamo in pagina, invece di limitarci a
disabilitare un campo senza spiegare perché.

## L'isolamento fra pazienti

Nella Patient App gli id non compaiono negli URL — ma **non è quella la
difesa**. La difesa è che una riga di un altro paziente non esiste per la
sessione di questo, qualunque query si scriva: nessuna lettura filtra per
paziente a mano, ci pensa la Row Level Security.

`npm run db:verifica -- seed` lo dimostra a ogni esecuzione: crea un
secondo paziente, entra come lui e prova a leggere **senza filtri** misure,
documenti, punteggi, questionari, messaggi, consensi, crediti e
appuntamenti. Devono tornare zero righe — e le stesse query, eseguite dal
primo paziente, devono tornare le sue, altrimenti staremmo festeggiando un
database che non risponde.

Lo stesso controllo pretende che ogni tabella dell'elenco **abbia almeno
una riga** nei dati dimostrativi: una tabella vuota passa qualunque
verifica di permessi, e «la reception non vede i questionari» sarebbe vero
nel modo in cui è vero che non vede una tabella che non esiste.

## Mobile

Non il desktop reso responsive: due disegni diversi.

Su telefono quattro voci a portata di pollice — Home, Percorso,
Appuntamenti, Messaggi — e un pannello che si apre dal basso per il resto.
Cinque icone da undici pixel di etichetta sono già il limite di quanto si
distingue con il pollice in movimento.

Su schermo largo una colonna che si può stringere a sole icone. Gli
strumenti in fondo — *Chiedi a Unique*, *Profilo* — stanno **fuori
dall'area che scorre**: se finiscono sotto la piega su uno schermo basso,
tanto vale non averli messi.
