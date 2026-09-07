# Terapia, laboratorio, timeline

Tre cose che rispondono a tre domande diverse di una giornata clinica: *cosa devo
dare*, *cosa ho chiesto e a che punto è*, *cosa è successo a questa persona.*

---

## La terapia

Unique aveva `recommended_actions` — «cosa devi fare», il piano che il paziente
legge nella sua applicazione — e i documenti di tipo `prescription`, che sono
PDF. Nessuna delle due risponde alla domanda che un'infermiera si fa alle otto
del mattino: **cosa devo dare, a chi, quanto, e a che ora.**

### Due tabelle, e la distinzione è l'intera idea

`prescriptions` è **cosa è stato deciso**: farmaco, dose, via, frequenza, orari,
durata, prescrittore. Cambia raramente.

`medication_administrations` è **cosa è successo**: una riga per ogni orario
previsto, con dentro se è stata data, rifiutata, saltata, e perché.

Tenerle insieme sarebbe stato più corto e avrebbe reso impossibile la sola
domanda che conta in una revisione: *quel giorno alle 14, quella dose, è stata
data?* Una prescrizione con un campo «somministrata» risponde una volta sola, e
la seconda volta cancella la prima.

### La riga «non data» vale quanto la riga «data»

Un rifiuto registrato è un fatto clinico: dice che il paziente c'era e ha detto
no. Una somministrazione mancante e basta dice soltanto che nessuno ha scritto
niente.

Per questo le righe nascono `due` e non al momento del gesto: esistono prima, e
restano anche se nessuno le tocca. Nella scheda una dose scaduta e mai registrata
si legge «non registrata», non «in attesa», e conta come non data nell'aderenza —
perché è quello che è.

Gli stati sono cinque e tre su cinque dicono che il farmaco non è stato dato:
`given`, `refused`, `skipped`, `not_needed`, più `due`. È quello che succede
davvero in un reparto, e un sistema che ammette solo «fatto» costringe a mentire
o a non scrivere. `refused` e `skipped` vogliono un motivo, e lo impone un
trigger: una dose non data senza una ragione scritta non si riesce più a leggere
fra un mese.

### Prescrivere è un atto medico; somministrare no

È la distinzione che rende la funzionalità utilizzabile. Un infermiere deve poter
registrare cosa ha dato — è il suo mestiere — e non deve poter cambiare la dose.

`can_prescribe()` chiede care team **più** disciplina medica; la policy di
somministrazione chiede solo di poter scrivere in cartella. Sta nel database e
non nell'interfaccia per la stessa ragione per cui ci sta
`can_approve_clinical_flag()`: è la differenza fra una convenzione e una
garanzia.

### Il giro

Raggruppato per orario e non per paziente, perché un turno si fa per orari: si
porta il carrello alle otto. Le scadute stanno fuori dai gruppi, in cima, con il
fondo tinto — sono l'unica cosa della schermata che qualcuno deve guardare
adesso.

Il gesto più frequente è un clic: «somministrata» non chiede niente, ed è ciò che
succede novanta volte su cento. Un rifiuto avvisa chi ha prescritto — è l'unico
dei quattro esiti che cambia una decisione clinica, e chi l'ha presa sarebbe
l'ultimo a saperlo.

Sospendere una terapia toglie le dosi future e lascia quelle passate: sono
successe.

---

## Il laboratorio

Metà della catena c'era già, ed era la metà difficile: `measurements` tiene
valore, unità e intervallo di riferimento; `measurement_proposals` legge un
referto e propone i valori; `can_approve_clinical_flag()` decide chi firma un
valore fuori soglia. Mancava ciò che sta **prima** — la richiesta.

Senza il primo anello il laboratorio non ha una coda. Un referto che arriva si
vede; un esame chiesto tre giorni fa e mai eseguito no, e sono esattamente i casi
che fanno male.

```
Richiesta → Prelievo → Analisi → Risultati → Validazione → Cartella
```

### Una tabella sola, non una per stato

`lab_requests` + `lab_collections` + `lab_results` sembra ordinato e produce tre
righe per un esame, da tenere allineate a mano. Qui c'è una riga che cambia stato
con un timestamp per passaggio: «quanto ci mette un emocromo dalla richiesta al
referto» diventa una sottrazione fra due colonne della stessa riga.

I risultati non stanno nell'ordine: vivono in `measurements`, dove stanno tutte
le misure di Unique, con un riferimento all'ordine che le ha prodotte. Un
pannello lipidico è un ordine e ventiquattro misure, e copiarle dentro l'ordine
avrebbe voluto dire averle in due posti — cioè, prima o poi, averle diverse.

### Le due separazioni che sembrano pedanteria

Fra `requested` e `collected` c'è **una persona** che deve andare a fare un
prelievo: è la coda dell'infermieristica, e unirli l'avrebbe cancellata.

Fra `resulted` e `validated` c'è **una firma**. Un valore risultato è un numero
uscito da uno strumento; un valore validato è un numero di cui qualcuno risponde
— ed è solo il secondo che entra in cartella e muove il Longevity Score. Per
questo validare non passa da `advance_lab_order` e chiede un medico.

### I parametri attesi

Non sono decorazione: sono ciò che permette di accorgersi che un valore **non** è
arrivato. Un referto senza ApoB su una richiesta che lo chiedeva è un buco che
qualcuno deve vedere.

I codici vengono dal catalogo in `src/lib/score/metrics.ts` — gli stessi che
alimentano il punteggio. Usarne altri avrebbe prodotto valori in cartella che
nessun pilastro guarda.

### L'andamento

`13,8 → 13,1 → 12,4 → 11,9` è la cosa che due valori a confronto non sanno dire:
tre discese di fila sono un'altra informazione rispetto a una discesa sola.

`metric_series()` la calcola in SQL con una window function. Su una persona
seguita da tre anni le misure sono qualche migliaio, e ricalcolare le variazioni
in memoria avrebbe voluto dire leggerle tutte.

In pagina è una **stat tile**, non un grafico: etichetta, valore, variazione, e
una sparkline che porta il contesto. Il dato che conta è un numero; la serie
serve a sapere da dove viene, e otto grafici con assi sarebbero stati otto
grafici da leggere invece di otto numeri da guardare. La scala comprende
l'intervallo di riferimento e non solo i dati, così la posizione della linea
rispetto alla fascia dice qualcosa da sola.

**Sale e scende sono direzioni, non giudizi.** Se una discesa dell'emoglobina sia
una buona notizia lo decide la curva di normalizzazione del punteggio,
versionata con l'algoritmo — non il segno di una sottrazione. La riga in fondo al
riquadro lo dice a chi legge.

---

## La timeline

`patient_timeline` è una vista, non una tabella: gli eventi *sono* le tabelle di
dominio, e una vista non può andare fuori sincrono con sé stessa. Univa cinque
cose; adesso ne unisce undici — punteggi, visite, referti, prescrizioni, esami,
terapie, note, conversazioni con il paziente, comunicazioni interne, consulti,
percorsi.

### `kind` non è `category`

`kind` dice **da quale tabella viene** la riga, e serve a disegnarla: decide
l'icona e il colore del pallino.

`category` dice **a quale domanda risponde**, e serve a filtrarla.

Sono raggruppamenti diversi di proposito. Un referto di laboratorio e un pannello
di valori approvati sono due `kind` e la stessa categoria; una prescrizione in
PDF e una prescrizione vera vengono da due tabelle lontanissime e sono entrambe
«terapie». Se le due coincidessero, il filtro «terapie» chiederebbe di sapere in
quale tabella Unique tiene le prescrizioni — che è una domanda che un medico non
deve porsi.

### Gli esami si aggregano per giornata

Un pannello lipidico sono ventiquattro righe in `measurements`, e ventiquattro
righe di timeline per un prelievo solo seppelliscono tutto il resto. Qui
diventano una riga — «Esami — 24 parametri» — con i primi tre nomi accanto per
riconoscere il pannello senza aprirlo.

### Il filtro ha un indirizzo

Sta in `?vista=` e agisce nel `where`, non sulle righe già lette. Le due cose
vanno insieme: l'indirizzo rende «gli esami di questa persona» qualcosa che si
manda a un collega, e il `where` evita di dire «nessun referto» quando i referti
ci sono ma stanno oltre la sessantesima riga.

### La vista è `security_invoker`

Ognuno vede nella timeline esattamente ciò che vedrebbe altrove. È la ragione per
cui le comunicazioni interne possono starci dentro senza che il paziente ne veda
mai una: la Row Level Security di `conversations` gli chiede di esserne partecipe,
e lui non lo è. Un controllo lo verifica a ogni esecuzione della suite.

---

## Analizza paziente

La domanda con cui un medico apre una cartella che non conosce, o che non apre da
tre mesi: *cosa devo sapere di questa persona, e cosa è cambiato dall'ultima
volta.*

**L'analisi non è generata da un modello. È assemblata da query.**

La strada breve era mandare la cartella a un modello e chiedergli otto paragrafi:
un decimo del codice, e la cosa peggiore possibile in clinica — un riepilogo
plausibile in cui un valore su venti è inventato e nessun modo di sapere quale.
Un LDL sbagliato dentro un testo ben scritto è più pericoloso di nessun testo,
perché viene creduto.

Qui ogni sezione è un dato. «Fuori range» sono le righe fuori dall'intervallo
stampato sul referto. «Cosa è cambiato» è un confronto di date, ancorato
all'ultima visita **conclusa** — non all'ultima in agenda, che avrebbe fatto
risultare «niente di nuovo» su ogni paziente con un appuntamento futuro.

Anche le domande da approfondire sono **regole**: un valore oltre la soglia
clinica, tre rilevazioni nella stessa direzione, una terapia presa meno di
quattro volte su cinque, referti arrivati senza che nessun valore sia entrato in
cartella. Ognuna porta con sé il fatto che l'ha accesa, ed è la differenza fra un
suggerimento che si verifica in due secondi e uno da credere sulla parola — il
secondo, dopo la terza volta che sbaglia, viene ignorato anche quando ha ragione.

Sono **domande** e non raccomandazioni. «Vale la pena chiedersi se la statina sia
tollerata» invita a guardare; «sospendi la statina» sarebbe una decisione
clinica, e quella non la prende un software.

Al modello resta il fondo della pagina, dove il copilot risponde con le sue fonti
obbligatorie. Sta dopo i fatti e non prima, e se non c'è — chiave non
configurata, rete caduta — la pagina resta intera. È il contrario di come si
costruiscono di solito queste cose, ed è la ragione per cui questa si può usare
in ambulatorio.
