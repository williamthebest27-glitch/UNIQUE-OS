# Marketing intelligence e Content Brain

Due cose diverse che vivono nello stesso posto per una ragione sola: i contenuti
si scrivono meglio se si sa quali hanno funzionato.

---

## La catena dell'attribuzione

```
campagna → creatività → lead → paziente → membership → pagamenti
```

I primi due anelli sono nuovi (`campaigns`, `creatives`); gli altri esistevano
già. A tenerli insieme è `leads.campaign_id`.

**L'attribuzione è al primo contatto.** La campagna che ha prodotto il lead si
prende il paziente. Chi lo ha convinto dopo — un reel, una telefonata, un amico —
non lo sappiamo: un modello multi-touch inventato sarebbe peggio di uno semplice
dichiarato. Quando ci sarà un tracciamento serio delle interazioni, la regola si
potrà cambiare in un posto solo.

## Perché due funzioni `security definer`

Il marketing non vede pazienti e pagamenti. Ma deve poter sapere quanto valore ha
generato una campagna, o sta lavorando alla cieca.

`campaign_attribution` e `campaign_patient_quality` risolvono la tensione
restituendo **solo numeri aggregati per campagna**: nessun nome, nessuna riga di
paziente, nessun importo singolo. Sono `security definer` perché devono poter
leggere tabelle che il chiamante non può leggere, e hanno il controllo di ruolo
scritto dentro la `where`.

## I conti

Tutti in [`src/lib/marketing/engine.ts`](../src/lib/marketing/engine.ts), funzioni
pure, 16 test.

| | |
| --- | --- |
| CPL | spesa ÷ lead |
| CAC | spesa ÷ pazienti acquisiti |
| ROAS | valore generato ÷ spesa |
| Conversione | pazienti ÷ lead |
| Tasso membership | membri ÷ pazienti |

Tre regole che l'interfaccia deve rispettare quanto il motore:

1. **Zero non è gratis.** Una campagna senza lead non ha un CPL pari a zero: non
   ne ha uno. Ogni rapporto con denominatore nullo torna `null`, e in pagina
   diventa "—", non "0 €".
2. **Le medie sono pesate.** Sommare i CPL e dividerli per il numero di campagne
   darebbe alla campagna da 50 € lo stesso peso di quella da 5.000. Si sommano
   spesa e lead, si divide alla fine.
3. **Il ritardo di attribuzione esiste.** La spesa è del mese, il paziente può
   arrivare il mese dopo. Un CAC su sette giorni è quasi sempre una calunnia
   verso la campagna.

### Le domande della visione

- *"Quanto abbiamo speso questo mese?"* → totali del periodo.
- *"Quale campagna porta i pazienti migliori?"* → `migliorQualita`, che ordina per
  valore generato **per paziente** e non per numero di lead: quella classifica
  premierebbe chi compra traffico a poco prezzo.
- *"Quale genera più membership?"* → `tassoMembership` e `cpMembershipCents`.
- *"Quali video stanno convertendo?"* → `valutaContenuti`, dove il punteggio pesa
  il coinvolgimento ma vale di più chi porta persone: un reel salvato da mille
  persone che non scrivono a nessuno ha fatto il suo mestiere a metà.

### Lo scarto di tracciamento

`platform_leads` sono i lead dichiarati da Meta o Google; `leads` sono quelli
arrivati nel CRM. Quando i due numeri divergono non è un dettaglio: è quasi
sempre un problema di tracciamento, e vederlo in pagina evita mesi di decisioni
prese su un numero sbagliato.

---

## Content Brain

**Senza modello linguistico fa due cose, e la seconda vale più della prima.**

### Costruisce l'impalcatura

Struttura del formato, fatti **citati** dalla knowledge base in vigore, angoli e
ganci che hanno funzionato davvero, vincoli di brand applicati, e — riga per
riga — cosa resta da scrivere.

I fatti si citano, non si riassumono: una parafrasi senza modello rischia di
cambiare il significato, e su un contenuto sanitario il significato è tutto.

Il risultato è una traccia con dentro le cose vere, **non un post finito**.
Chiamarlo copy sarebbe una bugia, e in un sistema che serve a decidere le bugie
costano più del lavoro che risparmiano. Le parole belle le trova un modello, e
non c'è motivo di fingere il contrario.

Quando la knowledge base non basta, l'impalcatura lo dice invece di riempire il
vuoto: *"Non trovo una voce di servizio su questo argomento. Scrivila lì prima:
un contenuto che dice cose non ancora scritte è un contenuto che nessuno può
verificare."*

### Controlla la conformità

**Qui il codice batte il modello**, e conviene dirlo chiaramente: un modello a
cui si chiede di non promettere guarigioni non le promette *quasi* sempre. Un
controllo a regole verifica tutte le volte, sullo stesso testo dà sempre la
stessa risposta, e non si stanca alla ventesima variante di un carosello.

In sanità la differenza non è accademica: un claim di guarigione in un contenuto
di una clinica è pubblicità sanitaria ingannevole, e la responsabilità è di chi
pubblica.

| Blocco — non si pubblica | Attenzione — si guarda |
| --- | --- |
| promessa di guarigione | superlativo assoluto |
| prevenzione garantita | risultato promesso entro una data |
| diagnosi promessa in un contenuto | percentuale senza fonte |
| confronto con altri centri | testimonianza clinica |
| urgenza artificiale | emoji come punteggiatura |
| **prezzo fuori listino** | più di una call to action |

Il controllo sui prezzi legge il listino in vigore dalla knowledge base: una cifra
che non è lì dentro è una promessa commerciale che qualcuno verrà a riscuotere.

Si usa su qualunque testo — scritto a mano, uscito da un modello, o preso da una
campagna già online. Sul secondo serve di più.

## Content Brain con il modello

Non è il brand book incollato in un prompt. Tre vincoli, tutti verificabili
guardando l'output:

**Scrive su ciò che Unique sa di sé.** Identità, sistema visivo e linee guida
arrivano dalla knowledge base nella versione in vigore oggi. Cambia il tono di
voce, cambia il prompt — senza che nessuno debba ricordarsi di aggiornare un file.

**I numeri li prende dal listino.** Un prezzo in un contenuto è una promessa
commerciale. Se non è nelle fonti fornite, il contenuto rimanda alla segreteria
invece di inventare una cifra.

**Dichiara fonti e avvertenze.** Ogni bozza esce con le voci su cui si regge (con
la loro versione, così fra sei mesi si capisce su quale listino era stata
scritta), i vincoli di brand che hanno cambiato le scelte, e l'elenco di ciò che
un medico deve rileggere prima della pubblicazione.

Ciò che è stato generato resta in `generated_contents`. Serve a rileggere a
distanza perché un contenuto diceva una certa frase, e ad accorgersi quando il
brand book cambia e i contenuti vecchi non lo rispettano più.

## Cosa manca

1. **L'importazione della spesa.** Oggi `campaign_daily_stats` si popola a mano o
   via API dalla rotta di integrazione. Servono le credenziali Meta e Google per
   automatizzarlo.
2. **Il tracciamento dell'origine.** Perché `leads.campaign_id` sia popolato
   serve che i moduli e le landing passino i parametri di campagna. Finché non
   c'è, l'attribuzione resta parziale e i numeri vanno letti sapendolo.
3. **Le metriche organiche.** `content_pieces` si popola a mano: le API di
   Instagram e TikTok richiedono un'app approvata.
