# Control Center, CRM e capacità

Il quarto pezzo dei quattro livelli: la vista di chi dirige. Deliberatamente
diversa dall’app paziente — fondo scuro, numeri densi, niente respiro. Sono due
mestieri: al paziente serve calma, a chi dirige serve vedere tutto insieme.

Ci arrivano solo i profili `admin` e `owner`; un professionista viene rimandato
alla sua area.

---

## Customer journey

Lo stato di ogni persona nel percorso — da lead a retention — **non è un campo
che qualcuno aggiorna: è derivato dai fatti.** Un campo scritto a mano si
disallinea al primo passaggio dimenticato, e uno stato sbagliato in un CRM è
peggio di nessuno stato, perché ci si costruiscono sopra decisioni e
automazioni.

Gli stati sono quelli della visione, con due uscite laterali — *inattivo* e
*perso* — che l’imbuto da solo non prevede ma la realtà sì.

Due regole di precedenza che vale la pena conoscere: **il percorso in corso
batte la membership attiva**, perché descrive cosa sta succedendo adesso; e
**l’inattività batte tutto tranne "perso"**, perché un membro fermo da sei mesi
non è in retention per quanto la membership risulti attiva.

Ogni stato porta con sé il motivo per cui è stato assegnato.

## Next Best Action

**Le regole cliniche e quelle commerciali sono due elenchi separati, e restano
separate fino allo schermo.** Non è una convenzione di stile.

Un suggerimento clinico che compete in classifica con uno commerciale finisce,
prima o poi, per essere scelto quando conviene invece che quando serve. Qui non
possono nemmeno mescolarsi: `nextBestActions` restituisce due liste, non una
ordinata, e la cartella le mostra in due colonne.

La separazione è verificata da un test che conta più di una dichiarazione
d’intenti: a parità di situazione clinica, i suggerimenti clinici devono essere
**identici** che il paziente abbia quaranta crediti o zero, la membership in
scadenza o appena rinnovata.

Ogni suggerimento porta i fatti che lo hanno attivato — "Score effettuato 87
giorni fa", "ha utilizzato 3 crediti su 6" — perché chi legge deve poter
verificare il perché senza fidarsi del cosa.

## CRM

Stati, origine, campagna, servizio d’interesse, conversazioni, appuntamenti,
conversione e valore generato.

**Il valore economico non si scrive sul lead: si legge dai pagamenti del
paziente in cui si è trasformato.** Un numero copiato in due posti prima o poi
diverge, e in un CRM il numero sbagliato è quello su cui si decide quanto
spendere in pubblicità.

### Identità omnicanale

`lead_identities` tiene i recapiti su ogni canale — numero WhatsApp, email,
handle Instagram — con un vincolo di unicità che impedisce allo stesso recapito
di finire su due lead diversi. È la base per rispondere alla domanda della
visione: *questa persona che scrive su WhatsApp è lo stesso lead arrivato ieri
da Meta e diventato paziente oggi.*

I canali veri non sono collegati: servono credenziali WhatsApp Business, Meta e
un provider email. La tabella li aspetta.

## Unit economics

```
prezzo − materiali = base compensabile
base × quota       = compenso al professionista
base − compenso    = margine Unique
```

I materiali si tolgono **prima** della divisione, quindi pesano su entrambi in
proporzione. È la scelta contrattuale del tuo esempio, ed è un test: 250 € con
25 € di materiali al 70% dà 157,50 € al professionista e 67,50 € a Unique.

### Regole di compenso

Configurabili per professionista, per servizio, per entrambi o per nessuno dei
due, con scaglioni sul numero di visite del mese.

Vince la regola più specifica — professionista *e* servizio batte il solo
professionista, che batte il solo servizio, che batte la regola generale — e a
parità di specificità vince lo scaglione più alto fra quelli raggiunti. Gli
scaglioni si contano per professionista e per mese solare.

Senza alcuna regola applicabile il compenso è zero: non si inventa una quota
predefinita nel codice.

## Compensi ai professionisti

Il report mensile risponde a "quanto dobbiamo pagare questo mese", ma soprattutto
**si può ricostruire**: ogni importo porta le visite che lo compongono, divise
per servizio, e le rettifiche con il proprio motivo. Un test verifica che la
somma delle righe faccia il totale, e che ogni riga si ricostruisca dalle sue
visite.

Una mancata presentazione è pagata come una visita svolta — il professionista ha
tenuto lo slot — ma senza materiali, che non sono stati consumati. È una scelta
contrattuale da confermare: se cambia, si cambia in un punto solo.

Chi ha solo una rettifica e nessuna visita compare comunque nel report.

## Capacità

Il modello di consumo **non è un’ipotesi**: si ricava da quanto i membri attuali
hanno davvero consumato, annualizzato sul periodo osservato. Con pochi membri o
un periodo corto le funzioni restituiscono un elenco vuoto invece di un numero
che sembra una previsione.

Le quattro domande della visione hanno quattro funzioni:

| Domanda | Funzione |
| --- | --- |
| Quanti membri possiamo ancora acquisire? | `growthHeadroom` |
| Quale professionista è il collo di bottiglia? | `bottleneck` |
| Se arriviamo a mille membri, quante ore servono? | `projectDemand` |
| Quando serve un secondo medico? | `monthsToSaturation` |

Due dettagli che cambiano le risposte:

**Il limite lo pone la disciplina che si esaurisce per prima, non la media.**
Una clinica con nutrizione al 40% e medicina al 98% non ha margine, ha un
problema.

**Chi non ha orari configurati non può essere il collo di bottiglia.** Di lui non
sappiamo la capacità, e un’ignoranza non è una diagnosi: il Control Center lo
dichiara invece di dedurre.

La saturazione oltre il 100% viene mostrata, non troncata: significa che si sta
lavorando oltre l’orario, ed è esattamente ciò che si vuole vedere.

## Perché tanti test

I motori di economia, capacità, journey e Next Best Action sono **funzioni
pure**: nessuna query, nessuna data implicita, nessun arrotondamento nascosto.
È la ragione per cui sono coperti da test e il caricamento dati no — lì non c’è
niente da testare, solo query da eseguire.

Su questi numeri si decidono compensi, prezzi e assunzioni. Un errore di
arrotondamento in un report di compensi non è un difetto grafico.

## Da fare

1. **Costi fissi.** Il margine di oggi è per visita: affitto, personale di
   segreteria e ammortamenti non entrano. Senza, il "margine Unique" è un
   margine di contribuzione, non un utile — e va detto a chi lo legge.
2. **CAC.** La visione lo chiede, ma serve la spesa pubblicitaria per campagna:
   arriva dalle piattaforme, non dal database.
3. **Occupancy per ambulatorio.** Oggi la saturazione è per professionista; la
   capacità degli ambulatori è calcolata ma non ancora incrociata con le visite.
4. **Storico dei KPI.** La control room mostra oggi e questo mese. Per vedere una
   tendenza servirà uno snapshot giornaliero.
5. **CRM operativo.** I lead si leggono ma non si modificano dall’interfaccia:
   mancano il cambio di stato, l’assegnazione e la registrazione di una
   conversazione.
