# Unique Brain

> Io: "Come sta andando Unique questo mese?"
> Brain: "Fatturato €X, +12% sul mese precedente. 34 nuovi pazienti e 17
> membership. La conversione Score → Membership è scesa dal 31% al 24%…"
> Io: "Perché?"

Perché la seconda domanda funzioni servono tre cose che una chat non ha.

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
