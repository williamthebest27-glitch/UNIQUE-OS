# Freschezza dei dati

Quando una schermata può mostrare una versione vecchia di sé, e quando no.

Unique OS tiene in memoria le sezioni già visitate per riaprirle senza attesa.
È ciò che rende immediato passare da Economia a CRM e tornare indietro. Su un
referto o su una misura, però, la stessa memoria diventa un difetto: mostrare il
valore di trenta secondi fa non è lentezza risparmiata, è un dato sbagliato
sotto gli occhi di qualcuno che sta decidendo qualcosa.

La regola è una sola: **i dati clinici non passano mai dalla cache.** Tutto il
resto sì.

---

## Le due metà del problema

Sono due meccanismi diversi, e coprono metà del problema ciascuno. Serve
entrambi, e confonderli porta a credere di essere protetti quando non lo si è.

### `unstable_dynamicStaleTime = 0` — fra persone diverse

Il medico approva una misura. Il paziente, sul suo telefono, ha la pagina
Risultati già in memoria. Nessuna riga di codice eseguita sul server del medico
può svuotare la cache del browser del paziente: sono due sessioni che non si
conoscono.

L'unica difesa è che quella pagina, sul telefono del paziente, **non sia
riutilizzabile per definizione**. È ciò che fa l'export in cima a ogni pagina
clinica:

```ts
export const unstable_dynamicStaleTime = 0;
```

Il router del browser considera quella schermata scaduta nell'istante in cui la
riceve. Riaprirla significa sempre richiederla al server.

### `revalidatePath` — dentro la stessa sessione

La reception sposta un appuntamento e poi riapre l'agenda. Qui il problema è la
memoria del *suo* browser, e la si svuota da dentro l'azione che ha scritto il
dato. Se ne occupa [`src/lib/cache/invalidazione.ts`](../src/lib/cache/invalidazione.ts),
che ragiona per fatti — «è cambiata la cartella clinica», «è cambiata l'agenda»
— invece che per elenchi di percorsi, perché un elenco di percorsi invecchia in
silenzio.

Serve anche alle sezioni **non** cliniche, quelle che la cache la usano davvero:
lì un'invalidazione mancante è un numero vecchio che resta a schermo.

---

## Cosa non passa mai dalla cache

| Area | Sezioni |
| --- | --- |
| Patient App | Home, Percorso, Piano, Risultati, Progressi, Longevity Score, Documenti, Questionari, Messaggi, Notifiche, Chiedi a Unique, Appuntamenti |
| Area clinica | tutta: Oggi, Agenda, Pazienti, Cartella paziente, Documenti, Revisioni, Task |
| Control room | Scheda paziente, Approvazioni |

L'area clinica è interamente esclusa dalla cache senza distinguere sezione per
sezione: è il posto in cui si lavora sui pazienti, e la distinzione fra una
schermata clinica e una organizzativa lì non regge alla prova dei fatti — chi
apre l'agenda lo fa per decidere di una persona.

## Cosa resta in cache, per trenta secondi

I cruscotti della direzione: Control Center, Economia, Capacità, CRM,
Marketing, Contenuti, Knowledge base, Task, Incassi, Listino, Professionisti,
Agenda del banco, Unique Brain, e l'anagrafica pazienti — che di proposito non
mostra né referti né misure.

Dal lato paziente restano in cache Membership e Profilo: crediti e preferenze,
non parametri clinici.

Trenta secondi valgono per numeri che si guardano per farsi un'idea. Il valore è
in `next.config.ts` sotto `experimental.staleTimes.dynamic`, e per azzerare la
cache ovunque basta portarlo a `0`.

---

## Perché non basta togliere la cache

La memoria del router non è l'unica strada per un dato vecchio. Le altre due
sono già coperte, ma vale la pena sapere che esistono.

**Il pulsante indietro del browser.** Next riusa deliberatamente la schermata
precedente per non perdere la posizione dello scroll, e in quel caso ignora
qualunque tempo di scadenza. La protezione arriva da un'altra parte: ogni Server
Action invalida quella memoria per intero. Chiunque scriva qualcosa svuota il
proprio storico di navigazione.

**Il prefetch al passaggio del mouse.** Sfiorando una voce del menu, Next
scarica la sezione con i suoi dati, così al clic non c'è nulla da attendere. Non
è una versione conservata: è una lettura fatta duecento millisecondi prima del
clic, e su una pagina con `unstable_dynamicStaleTime = 0` viene comunque
riverificata. La navigazione resta veloce senza barattare nulla.

---

## Aggiungere una sezione

Se la sezione nuova mostra qualcosa che riguarda il corpo di una persona —
misure, referti, punteggi, piani, note, messaggi con il team clinico — allora,
subito sotto `export const dynamic`:

```ts
export const unstable_dynamicStaleTime = 0;
```

Va su `page.tsx`, non su `layout.tsx`: Next lo accetta solo sulle pagine.

Se la sezione nuova ha un'azione che **scrive**, la funzione da chiamare sta in
`src/lib/cache/invalidazione.ts`. Se nessuna di quelle esistenti descrive ciò che
è cambiato, la cosa giusta è aggiungerne una — non infilare tre `revalidatePath`
nell'azione, che è esattamente il modo in cui questi buchi si sono formati la
prima volta.
