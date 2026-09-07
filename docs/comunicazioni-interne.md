# Comunicazioni interne

Unique aveva una messaggistica: `message_threads` e `messages`, che collegano il
paziente alla clinica. Non aveva niente per la domanda opposta — **come parlano
fra loro le persone che curano** — e quella conversazione avveniva comunque, in
corridoio e su WhatsApp, dove non lascia traccia e non si può contare.

## Perché tabelle nuove e non quelle che c'erano

Riusarle sarebbe stato allettante e sbagliato.

Un filo di `message_threads` ha un paziente e due lati, e il paziente è uno dei
due: la sua Row Level Security parte da `can_access_patient()`, che al paziente
stesso dice sempre sì. Metterci dentro un consulto specialistico avrebbe
significato che la persona di cui si discute legge la discussione.

Non è un dettaglio di permessi. È la ragione per cui la comunicazione fra medici
è una tabella diversa, e il motivo per cui la sezione «Comunicazioni» dice in
testa che il paziente non la vede: chi scrive deve saperlo senza doverlo dedurre.

## Le quattro idee

**Il reparto è una riga, non un enum.** La direzione ne aggiunge uno da
`/control/reparti` senza una migrazione, e una persona può stare in più reparti.
Un elenco scritto nel codice sarebbe invecchiato al primo ambulatorio nuovo.

I reparti seminati sono le unità che una longevity clinic ha davvero — Medicina,
Diagnostica, Nutrizione, Osteopatia, Psicologia, Preparazione, Infermieristica,
più tre non cliniche — e non i reparti di un ospedale per acuti. Qui non c'è un
pronto soccorso, e un reparto vuoto in elenco è peggio di un reparto mancante:
insegna che la lista non descrive la realtà.

**Si partecipa da persona o da reparto.** Una conversazione fra due reparti non
elenca venti nomi: elenca due reparti, e chi ne fa parte oggi la vede — anche chi
ci entrerà il mese prossimo. È l'unico modo perché «Diagnostica risponde a
Medicina» resti vero quando cambia il turno.

Lo stato di lettura resta però di una persona: un reparto non ha occhi. La riga
individuale nasce da sé quando qualcuno del reparto apre il filo.

**Il consulto è un oggetto con uno stato**, non un messaggio con un punto
interrogativo. `aperto → preso in carico → in valutazione → risposto → chiuso`,
mossi solo da `advance_consultation`. La differenza si vede il martedì mattina:
«quante richieste di parere non ha ancora preso in carico nessuno» ha una
risposta se è una colonna, e non ne ha nessuna se è una frase dentro una chat.

**Chiedere un consulto è un motivo di cura.** Uno specialista a cui si chiede un
parere su una persona che non segue deve poter aprire la sua cartella, o il
parere che darà vale quanto un'opinione data al telefono senza guardare gli
esami. Per questo `can_access_patient()` viene **esteso**, non aggirato: il
permesso è legato all'oggetto, dura quanto il consulto e trenta giorni oltre la
chiusura, finisce da sé, e ogni apertura resta nel registro.

## Chi vede cosa

Tre strade, e nessuna quarta:

- si è partecipanti come persona;
- si fa parte di un reparto che partecipa;
- la conversazione è legata a un paziente e chi guarda è la direzione.

**Essere un medico non basta.** Un professionista non partecipante e non del
reparto non vede la conversazione nemmeno se ha in cura il paziente di cui si
parla: leggere una cartella e leggere ciò che due colleghi si sono detti sono due
permessi diversi, e confonderli significa che nessuno scriverà più niente di
franco.

Vedere e scrivere non coincidono: la direzione legge le conversazioni cliniche di
un paziente senza esserne parte, e non ci scrive dentro.

Otto controlli in `npm run db:verifica -- seed` lo verificano su un Postgres
vero, con sessioni `authenticated` reali.

## Le priorità

`low`, `normal`, `high`, `urgent`, `critical`. Non sono decorative: `urgent` e
`critical` accendono una notifica che interrompe, `low` e `normal` non suonano
mai. Una scala che non cambia niente diventa un aggettivo, e allora tutti
scrivono «urgente».

I tipi di messaggio sono sei — informazione, richiesta, consulto, esame, terapia,
trasferimento — e «urgente» non è fra questi. È una priorità: tenerla fra i tipi
avrebbe permesso un messaggio di tipo «urgente» con priorità «bassa».

Il rosso in Unique è il colore del **marchio**, quindi solo `urgent` e `critical`
lo prendono; `high` è oro; il resto è neutro, cioè invisibile — che per una
priorità normale è il comportamento giusto.

## Il tempo reale

Supabase Realtime, non polling. All'arrivo di un evento la pagina chiama
`router.refresh()` invece di ricostruire i dati nel browser: il payload di un
evento è la riga grezza, senza i nomi, senza le ricevute, senza il reparto di chi
scrive, e una seconda strada per la stessa schermata sarebbe divergita al primo
campo aggiunto.

Realtime valuta la Row Level Security per ogni sottoscrittore: una riga che non
si vede non arriva nemmeno come evento. Il polling resta come rete di sicurezza,
lento e acceso solo quando il canale è caduto.

## La giornata cambia con chi la apre

`/pro` si compone dal **profilo operativo** di chi guarda, ricavato da disciplina
e reparti — con il reparto che vince sulla disciplina, perché un medico assegnato
alla Diagnostica passa la giornata a refertare e non in ambulatorio.

| Profilo | Apre su |
| --- | --- |
| Medico | segnali clinici, comunicazioni, agenda, pazienti da guardare |
| Infermieristica | giro delle somministrazioni, azioni del piano, parametri, consegne |
| Diagnostica | coda del laboratorio, richieste di parere, validazioni, referti |
| Area clinica | il command center generico, per le altre discipline |

**Il profilo cambia la composizione, mai i permessi.** Se avesse anche solo un
effetto sui dati sarebbe un controllo di accesso scritto nel browser, e i
controlli di accesso stanno nella Row Level Security. Chi arrivasse qui con un
profilo che non gli spetta vedrebbe riquadri vuoti, non dati altrui.

Il passaggio di consegne dell'infermieristica non è un canale a parte: sono i
messaggi interni di tipo «trasferimento». Un quaderno delle consegne separato
sarebbe stato più semplice da costruire e impossibile da verificare; così ogni
riga porta con sé le sue ricevute di lettura e la sua riga nel registro.

## Cosa non c'è

Unique è una clinica ambulatoriale di longevità, non un ospedale per acuti.

Non ci sono **ricoveri**, perché non ci sono reparti di degenza. Non c'è una
**catena di custodia dei campioni**, che è una cosa vera con le sue etichette, la
sua accettazione e il suo hardware. Disegnarle su tabelle inesistenti avrebbe
prodotto la cosa peggiore in un sistema clinico: un posto dove si va a cercare un
dato che non c'è mai stato.

Il ruolo amministrativo la sua schermata ce l'aveva già: il Control Center si
differenzia per ruolo da `CONTROL_SECTIONS`, e reception e direzione ci trovano
accettazione, anagrafiche, incassi e documenti.

## Il registro

Ogni gesto lascia una riga: comunicazione aperta, messaggio inviato, lettura,
consulto richiesto, preso in carico, risposto, chiuso, allegato caricato.

Si legge da `/pro/comunicazioni/registro`, e non ha un controllo di ruolo perché
non gli servirebbe: `audit_log` ha due policy che decidono al posto suo — la
direzione vede tutto, chi partecipa a una conversazione ne vede le tracce.

Le righe non si scrivono dal browser: le produce `log_comms`, che è
`security definer`, e un trigger rifiuta ogni modifica. Vedi
[sicurezza-e-gdpr.md](sicurezza-e-gdpr.md).

## Gli allegati

Due strade, e sono due di proposito.

`document_id` allega un referto **già in cartella**: non copia niente, e i
permessi restano quelli del documento — se domani il paziente esce dal tuo care
team, l'allegato smette di aprirsi.

`storage_path` è per ciò che nasce nella conversazione e in cartella non c'è: la
foto di una lastra, il PDF di un collega esterno. Vive nel bucket privato
`clinical-comms`, indirizzato per conversazione, e si apre con un URL firmato che
vale dieci minuti.

Un referto va caricato in cartella e allegato da lì: qui salterebbe la
classificazione, l'estrazione dei valori e la revisione.
