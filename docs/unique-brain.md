# Unique Brain

> Io: "Come sta andando Unique questo mese?"
> Brain: "Fatturato €X, +12% sul mese precedente. 34 nuovi pazienti e 17
> membership. La conversione Score → Membership è scesa dal 31% al 24%…"
> Io: "Perché?"

Perché la seconda domanda funzioni servono tre cose che una chat non ha.

---

## Il motore è di Unique, e funziona da solo

**Il Brain risponde senza modello linguistico, senza rete e senza chiavi.** È la
configurazione predefinita: si apre `/control/brain` e funziona.

Non è un ripiego in attesa di un'API. È l'applicazione di ciò che la visione
chiedeva — *"il Brain non dovrebbe essere semplicemente ChatGPT con i documenti di
Unique caricati"*. I numeri li sa già il database, le regole le sa già il codice,
e la lingua italiana si può scrivere una volta sola.

Con dati sanitari questa non è una preferenza tecnica. Ogni domanda mandata a
un'API esterna è un trasferimento di dati che vuole un accordo sul trattamento,
una base giuridica e una riga nel registro. Un motore che gira dentro
l'infrastruttura non ha niente di tutto questo da giustificare.

### Come fa

L'intuizione: **in una control room le domande non sono infinite.** Sono venti
domande poste in cento modi diversi, ed è la seconda parte a essere difficile.

```
domanda  →  intento + parametri  →  motori di calcolo  →  frasi
```

1. [`intenti.ts`](../src/lib/brain/intenti.ts) normalizza (accenti compresi: chi
   scrive di fretta scrive "capacita") e riconosce l'intento con gruppi di
   sinonimi. Tutti i gruppi devono trovare una parola: "campagne" da solo non è
   "quale campagna porta i pazienti migliori", e non deve diventarlo.
2. Il periodo e i giorni si estraggono dalla domanda: "il mese scorso", "ad
   agosto", "da tre mesi". A settembre, "dicembre" è quello dell'anno prima —
   non si chiedono i numeri di un mese che deve ancora arrivare.
3. I dati arrivano dai motori che già esistono: unit economics, capacità,
   marketing, knowledge base. Passano tutti dal client di sessione, quindi dalla
   Row Level Security.
4. [`narrativa.ts`](../src/lib/brain/narrativa.ts) compone la risposta: prima il
   numero, poi il senso; `null` non diventa mai zero; ciò che manca si dichiara.

**Quando non capisce lo dice**, e mostra cosa sa rispondere. Un motore che
indovina è un motore di cui non ci si fida al terzo errore.

E può anche *fare*: "preparami i contatti per chi non usa i crediti da 90 giorni"
crea una proposta, con anteprima e autorizzazione. Lo stesso ciclo di sempre.

### Da un elenco a una grammatica

Il catalogo di intenti ha un limite strutturale: un intento è una domanda
scritta a mano, e quindici intenti sono quindici domande. Per capire "tutto"
non se ne scrivono altri quindici — si smette di scrivere domande.

[`interrogazione.ts`](../src/lib/brain/interrogazione.ts) riconosce **tre cose
componibili**: che cosa si misura, per cosa lo si raggruppa, con quali filtri.
Le combinazioni sono centinaia senza che nessuno le abbia previste una per una.

| Domanda | Interrogazione |
| --- | --- |
| quanto abbiamo fatturato per servizio ad agosto | fatturato × servizio, 2026-08 |
| qual è il servizio più redditizio | margine × servizio, il primo |
| i tre professionisti che fatturano di più | fatturato × professionista, primi 3 |
| quante visite di nutrizione questo mese | visite, disciplina = nutrizione |
| quanto ha fatturato il dottor Rossi a luglio | fatturato, professionista = Rossi, 2026-07 |
| da quale canale arrivano più lead | lead × canale, il primo |

Tredici misure (fatturato, margine, visite, pazienti, lead, membership, crediti,
spesa, compensi, conversione, no-show, documenti, task), sette dimensioni
(servizio, professionista, disciplina, canale, campagna, sede, paziente), un
periodo, una classifica, un limite. Il risolutore non calcola niente di nuovo:
raggruppa le righe economiche visita per visita che il motore di unit economics
produce già, e che sono già testate.

**Il perché.** "Perché il fatturato è sceso?" non si risponde con un'opinione: si
scompone la differenza fra i due mesi e si ordina chi l'ha causata. È
aritmetica, e proprio per questo ci si può fidare — dice *dove* la variazione è
avvenuta, non perché le persone si sono comportate così, e la risposta lo
dichiara. Si fermano all'ottanta per cento della variazione spiegata: le voci
oltre sono rumore, ed elencarle nasconde quelle che contano.

**I seguiti.** "Perché?" da solo non è una domanda, è un seguito; "e ad agosto?"
pure. Con l'ultima domanda in mano si completano: la prima diventa la
spiegazione di ciò che si era appena misurato, la seconda la stessa misura su un
altro mese.

**Prima di arrendersi, la knowledge base.** Una domanda che non è né una misura
né un intento può avere una risposta scritta da qualcuno — una procedura, una
FAQ. Si cerca con le parole della domanda, e solo se non esce niente il Brain
dice che non ha capito.

**Ciò che non si può fare si dice.** "I crediti utilizzati li ho solo per
oggi" è una risposta; un numero di oggi spacciato per il mese è un errore. Ogni
risultato porta i limiti con sé, e la frase li ripete.

### Il pregio che un modello non ha

**Si può testare.** Il riconoscimento, l'interrogazione e la composizione sono
coperti da casi di prova: un intento sbagliato è un test che fallisce, non una
supposizione sul comportamento di un modello. Quando la risposta cambia, si sa
perché. E una batteria di domande poste come le porrebbe una persona è il modo
in cui si trovano gli errori — "quanto costa la visita nutrizionale" finiva fra
le visite invece che nel listino, ed è diventata un caso di prova.

### Un modello in casa: Ollama

`UNIQUE_BRAIN=ollama` accende un modello aperto — Llama, Qwen, Mistral — servito
da [Ollama](https://ollama.com) su una macchina di Unique. È la risposta a una
domanda precisa: come si ha la conversazione libera senza che una parola esca
dalla clinica. I dati sanitari restano dove sono, e la bolletta è la corrente.

Sul server:

```bash
ollama pull qwen2.5:14b
```

In `.env.local`: `UNIQUE_BRAIN=ollama`, e se Ollama non è sulla stessa macchina
`OLLAMA_URL=http://<server>:11434`. `OLLAMA_MODEL` sceglie il modello; il
predefinito è prudente, non ambizioso.

Quattro cose passano dal modello locale, e in nessuna il modello inventa numeri:

- **la chat del founder**, con **gli stessi strumenti** del percorso esterno —
  stessi oggetti, stesso `run`, stessa Row Level Security sotto. Il ciclo degli
  strumenti è scritto a mano in [`ollama.ts`](../src/lib/brain/ollama.ts),
  perché l'SDK di Anthropic non parla con Ollama; ciò che il modello sa dei
  fatti resta ciò che gli strumenti gli danno;
- **il copilot clinico** su domande libere, con lo stesso schema di risposta e
  le fonti obbligatorie;
- **il Content Brain**, che qui scrive copy finito invece dell'impalcatura;
- **la lettura dei referti** che il lettore proprietario non copre: un'immagine,
  con un modello che sappia guardarla (`llama3.2-vision`, `llava`). Un PDF con
  il testo viene prima convertito in testo, che è più affidabile di un'immagine
  per qualunque modello. Un PDF scansionato — pagine e niente testo — resta
  fuori: andrebbe rasterizzato, e senza una libreria per farlo è meglio dirlo.

L'uscita strutturata usa lo schema JSON che Ollama accetta; la validazione con lo
stesso schema Zod a valle è la rete. Un modello vincolato produce JSON valido,
non necessariamente JSON sensato — e ogni valore passa comunque da
`validateExtraction` e da un medico.

**La qualità dipende dal modello e dalla macchina.** Un modello piccolo su una
CPU risponde in un minuto e sbaglia più di uno grande su una GPU. Il motore
proprietario resta la strada predefinita, perché su ciò che sa fare è più
affidabile di qualunque modello: risponde sempre allo stesso modo, e i suoi
errori sono test.

### Il modello esterno, quando serve

`UNIQUE_BRAIN=anthropic` (con `ANTHROPIC_API_KEY`) accende un modello esterno.
Si attiva **di proposito**: una chiave dimenticata in un file di ambiente non è
un consenso a mandare fuori i numeri dell'azienda.

Referti, copilot clinico e contenuti funzionano senza modello — ne hanno una
versione proprietaria ciascuno, descritta nei rispettivi documenti. Il modello
aggiunge tre cose che restano lavoro di lingua: la conversazione davvero libera,
la lettura di un referto scansionato, e il copy finito invece dell'impalcatura.

---

## 1. Gli strumenti

Il modello non conosce i numeri di Unique. Li chiede, e le chiamate restano
scritte sotto la risposta.

| Strumento | Risponde a |
| --- | --- |
| `andamento_azienda` | fatturato, pazienti, membership, conversione, margine, compensi, capacità |
| `marketing` | campagne, CPL, CAC, ROAS, qualità dei pazienti, contenuti |
| `conoscenza` | prezzi, procedure, regole — solo ciò che è vero oggi, con la versione |
| `pazienti_fermi` | chi non viene, o chi ha una membership che non usa |
| `eventi` | cosa è successo davvero negli ultimi giorni |
| `task_aperti` | cosa è in sospeso e di chi |
| `proponi_azione` | prepara un'azione e la mette in attesa di autorizzazione |
| `ricorda` | annota una decisione, perché valga anche domani |

Sono **poche e larghe**: dieci strumenti stretti costringono il modello a
comporre una risposta da dieci chiamate e a sbagliarne una. Ognuno risponde a
una domanda intera.

Tutti passano dal client di sessione, quindi dalla Row Level Security. **Non c'è
modo di ottenere dal Brain un dato che non si potrebbe leggere da soli.**

E restituiscono numeri, non frasi: un totale calcolato dal motore economico e
passato al modello è verificabile; un totale che il modello ricava contando
righe è una speranza.

## 2. La memoria

`brain_memory` conserva le decisioni prese e le preferenze dichiarate — non la
trascrizione delle chat. "Le comunicazioni ai pazienti si approvano sempre
prima", "il prezzo dello Score è passato a 149 il 15 marzo". Ha una data di
validità, per la stessa ragione della knowledge base: una preferenza di sei mesi
fa può non valere più.

Le conversazioni sono private di chi le ha avute — nemmeno un altro
amministratore le legge. La memoria invece è dell'azienda.

## 3. Il confine fra dire e fare

```
PROPOSTA  →  ANTEPRIMA  →  AUTORIZZAZIONE  →  ESECUZIONE
```

Quattro momenti, tre persone-gesto distinti. Chi propone non esegue; chi approva
vede prima cosa succede; chi esegue rilegge lo stato.

### Le quattro classi

| Classe | Cosa serve |
| --- | --- |
| `read` | niente. Leggere non cambia il mondo |
| `suggest` | niente. L'AI dice, la persona decide |
| `reversible` | una conferma |
| `sensitive` | l'autorizzazione esplicita di chi ha il ruolo |

**La classe non la sceglie il modello.** Sta nel catalogo in
[`src/lib/approvals/policy.ts`](../src/lib/approvals/policy.ts), scritto a mano.
Un modello che potesse dichiarare "questa azione è reversibile" avrebbe il
permesso di declassare la propria azione, e l'approvazione sarebbe una
formalità.

Chiedere una conferma per ogni lettura avrebbe lo stesso effetto per un'altra
strada: insegnare a chi decide a cliccare "sì" senza leggere, così che il sì che
conta non venga letto nemmeno lui.

### L'anteprima

Si calcola **al momento della proposta**, sui dati veri: quanti pazienti,
quale prezzo c'è adesso, quante prenotazioni future, quali sistemi vengono
toccati. Chi decide vede gli stessi numeri che ha visto il Brain.

E scade dopo sette giorni: approvare oggi un'anteprima di dieci giorni fa
significherebbe eseguire su un mondo diverso da quello mostrato.

### Le azioni disponibili

| Azione | Classe | Cosa fa davvero |
| --- | --- | --- |
| `crea_task` | reversibile | assegna un'attività, con incaricato e scadenza |
| `avvisa_staff` | reversibile | scrive una notifica interna |
| `aggiorna_prezzo_servizio` | sensibile | cambia il listino **e** pubblica la versione in knowledge base |
| `pubblica_conoscenza` | sensibile | mette in vigore una versione, chiudendo la precedente |
| `prepara_riattivazione` | sensibile | crea un contatto per ogni paziente fermo, assegnato a qualcuno |

Due cose vanno dette chiaramente.

**Il prezzo si aggiorna in due posti nella stessa operazione.** Listino e
knowledge base, insieme. Lasciare la knowledge base in bozza significherebbe che
il sito dice 65 e il Brain risponde 60 — esattamente il problema che la
knowledge base versionata esiste per evitare.

**Niente esce da Unique senza che una persona lo mandi.** La riattivazione
prepara i contatti, non li fa: nessun canale di messaggistica è collegato, e
anche quando lo sarà l'invio sarà un'azione a sé, con la sua classe e la sua
approvazione.

## Cosa resta scritto

Ogni passaggio lascia una riga negli eventi di dominio: `brain.proposal_created`,
`brain.proposal_approved`, `brain.action_executed`, `brain.action_failed`. Se un
giorno qualcuno chiederà "chi ha cambiato il prezzo della visita il 14 settembre",
la risposta è ricostruibile per intero — chi ha proposto, chi ha autorizzato,
cosa mostrava l'anteprima, cosa è successo davvero.

Un'esecuzione fallita resta scritta sulla proposta. Un'azione che non è andata a
buon fine non deve poter sembrare mai tentata.

---

## Task e notifiche

**Un task solo per tutta Unique.** `professional_tasks` è diventata `tasks`:
richiamare un paziente è della reception, controllare un pagamento
dell'amministrazione, approvare uno Score di un medico. Due tabelle avrebbero
significato due elenchi e la domanda "dove sta il mio task". Ogni task ha
incaricato, priorità, scadenza, stato e **origine** — chi lo esegue ha diritto di
sapere se è nato da una persona o dal Brain.

**Tre livelli di notifica, e la differenza non è di tono ma di destino:**
`critical` interrompe, `important` si vede in giornata, `info` finisce nel digest
del mattino e non suona mai. Il briefing mostra sette righe, non settanta: ogni
riga deve poter cambiare la giornata di chi la legge, altrimenti è rumore.

## Cosa manca

1. **L'assenza di un professionista** non è modellata: il morning brief non può
   dire "1 professionista assente" finché non esiste un modello di
   disponibilità e assenze.
2. **Lo streaming.** La risposta arriva tutta insieme dopo qualche decina di
   secondi. La casella dice che sta guardando i dati, ma un flusso token per
   token sarebbe più onesto sull'attesa.
3. **Le azioni sono cinque.** Il catalogo cresce una voce alla volta, e ogni voce
   nuova va scritta con la sua anteprima: è il punto in cui vale la pena essere
   lenti.
4. **La conversione da conversazione ad azione è manuale.** Il Brain propone e
   una persona apre le approvazioni. Un domani la proposta potrà comparire nella
   chat con i pulsanti accanto, ma la sequenza resterà questa.
