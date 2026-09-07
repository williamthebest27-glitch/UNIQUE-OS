# Il Command Center

`/control/comando`. Una domanda sola: **cosa sta succedendo in clinica adesso.**

Unique sapeva già rispondere alle due domande accanto. `/control` dice come va il
mese — fatturato, lead, capacità. `/pro` dice cosa devo fare io oggi, filtrato dal
mio care team. Mancava quella in mezzo, che è la domanda di chi manda avanti la
giornata: quante persone ci sono, quante code si stanno allungando, cosa non ha
ancora preso in carico nessuno.

---

## Perché sta nel Control Center e non nell'area clinica

Perché i numeri che mostra sono veri solo lì.

`patients` ha una policy che passa da `can_access_patient()`. Un medico che chiede
«quanti pazienti» ottiene il suo care team: la stessa schermata gli direbbe 12
dove promette 128. Un cruscotto che cambia significato con chi lo apre, senza
dirlo, è peggio di nessun cruscotto — e il modo in cui succede non è un errore di
calcolo, è la Row Level Security che fa il suo mestiere.

Reception e marketing entrano nel Control Center ma vengono rimandati alla loro
schermata: le code sono cliniche, e a loro tornerebbero comunque zeri.

## La scelta che regge tutto il resto

**`command_center()` non è `security definer`.**

Un cruscotto è il posto più comodo in cui scavalcare la Row Level Security. I
numeri servono «per la direzione», la scorciatoia è una parola sola nella
definizione della funzione, e nessuno se ne accorge finché un giorno la reception
apre la pagina e legge quanti valori clinici sono in attesa di approvazione.

Con i diritti dell'invocante, ogni conteggio è **ciò che chi guarda avrebbe visto
aprendo la pagina corrispondente**. Non perché la pagina lo controlli: perché le
policy filtrano le righe prima che vengano contate. Il controllo di ruolo che
esiste — in `CONTROL_SECTIONS` — decide solo se la voce compare nel menu.

Un controllo lo verifica leggendo `pg_proc`, così la scorciatoia non si può
aggiungere in silenzio.

## Una funzione e non dieci query

Le code sono sei, e sei `select count(*)` dal server sono sei viaggi di rete per
disegnare una schermata che si ridisegna a ogni evento della clinica. Sarebbero
diventati sei viaggi per ogni messaggio scritto in reparto.

`command_center()` li fa in uno, dove i dati già stanno.

## Le code si aprono

Un cruscotto che sa dire «otto» e non sa dire *quali otto* costringe a fidarsi
del numero, e un numero in cui non si può guardare dentro è una decorazione.
`command_center_queue()` restituisce le righe dietro il conteggio, e ognuna porta
in cartella — che è dove si agisce.

Il join sul paziente è un `left join` di proposito: se chi guarda vede la
richiesta ma non la persona, la riga resta e il nome no. Un `inner join` l'avrebbe
fatta sparire, e sette righe sotto un contatore che dice otto è il modo più
veloce per far smettere di credere a entrambi.

L'ordine delle sei code non è alfabetico ed è la sola cosa progettata di
quell'elenco: scende da «non l'ha preso in carico nessuno» a «qualcuno ci sta
lavorando». Una coda senza proprietario è in ritardo di nessuno, ed è la sola che
non si smaltisce da sé.

## Cosa non c'è, e perché

**«Ricoveri» non è una cifra di questa schermata.** Unique è una clinica
ambulatoriale di longevità: non ci sono degenze, non c'è una tabella dei posti
letto. Un contatore disegnato su tabelle inesistenti avrebbe prodotto la cosa
peggiore in un sistema clinico — un numero che nessuno può verificare guardando
altrove. Al suo posto c'è l'equivalente onesto: **oggi in clinica**, gli
appuntamenti della giornata.

Tre code non hanno un collegamento «Apri», e il campo è `null` invece di puntare a
qualcosa di plausibile. Il giro delle somministrazioni e il laboratorio vivono
dentro il cruscotto di chi ci lavora, e mandare la direzione al *proprio* `/pro`
le mostrerebbe un'altra cosa. Le righe portano comunque in cartella.

## Il tempo reale

Una sottoscrizione sola su `domain_events`: ogni fatto della clinica ci passa,
quindi copre tutte e sei le code. Accanto c'è `clinical_consultations`, perché
prendere in carico un parere cambia una riga senza emettere un evento — ed è
esattamente ciò che questa schermata deve smettere di mostrare quando succede.

Come altrove: `router.refresh()`, non uno stato ricostruito nel browser. Vedi
[comunicazioni-interne.md](comunicazioni-interne.md).

Lo stato del collegamento è **scritto**, non solo colorato. Su una schermata che
resta aperta tutto il giorno la domanda «questi numeri sono di adesso o di
stamattina?» ha bisogno di una risposta visibile, e un pallino verde da solo la dà
soltanto a chi sa già cosa significa.

## Da lontano

È l'unica schermata di Unique pensata anche per essere guardata da due metri — un
monitor appeso in una stanza. Da qui le cifre sproporzionate, e la regola che
nessuna informazione stia in un colore soltanto: a due metri il colore si vede e
la sfumatura no. Il tono di una coda è una barretta piena accanto a un'etichetta
che dice già tutto; `signal-alert` su fondo scuro non regge come testo e regge
come superficie.

Sul telefono le tre cifre restano in riga. Impilate erano una prima schermata
intera di sole cifre, con le code — il motivo per cui si apre questa pagina —
sotto la piega.

## La schermata iniziale

`/control` resta «Oggi». Il Command Center è la prima voce del menu, non la
pagina di atterraggio: spostare l'atterraggio significa togliere alla direzione i
numeri che guarda ogni mattina, ed è una decisione di chi la clinica la dirige.
Si cambia in una riga, in `homePathForRole`.
