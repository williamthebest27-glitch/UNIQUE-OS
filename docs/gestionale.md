# Il gestionale

Fin qui Unique OS *leggeva* l’agenda di un gestionale esterno, da un endpoint di
sincronizzazione. Da qui la *tiene*: anagrafica, appuntamenti, disponibilità,
listino, professionisti, incassi e membership si fanno dal Control Center, con
le stesse tabelle che alimentano lo Score, il credit engine e il Brain.

Non è un secondo prodotto accanto al primo. È la ragione per cui i numeri della
direzione e il lavoro del banco non possono più divergere: un incasso registrato
alla reception è già nella unit economics, una visita fissata è già nella
capacità, un piano attivato ha già mosso i crediti.

---

## Chi fa cosa

| | Reception | Direzione |
|---|---|---|
| Anagrafica: creare, correggere recapiti | sì | sì |
| Agenda: fissare, confermare, esito, spostare, disdire | sì | sì |
| Pubblicare disponibilità | sì | sì |
| Incassi e ricevute | sì | sì |
| Attivare o sostituire una membership | sì | sì |
| Listino e stanze | — | sì |
| Professionisti e orari settimanali | — | sì |
| Cartella clinica, referti, misure | — | — (solo i professionisti) |

La riga che conta è l’ultima. **La reception vede l’agenda e non vede la
cartella**, e non è il menu a deciderlo: sono le policy di Row Level Security,
che per il ruolo `reception` elencano le tabelle leggibili una per una. Una
tabella nuova nasce invisibile. Il test di segregazione in `npm run db:verifica`
lo verifica a ogni esecuzione, con una sessione `reception` vera.

## Le sezioni

- **Pazienti** — l’elenco con recapiti, piano, crediti disponibili e ultima
  visita; la ricerca per nome, email, telefono o codice; il modulo per una
  persona nuova. La scheda operativa di ciascuno tiene in una pagina i gesti
  del banco: fissare la prossima visita, incassare, attivare il piano,
  correggere l’anagrafica.
- **Agenda** — i prossimi sette giorni con stanza e professionista, e su ogni
  visita i quattro gesti: conferma, svolta, non presentato, disdici. Il modulo
  per un appuntamento nuovo sta in cima.
- **Incassi** — quanto è entrato oggi e nel mese, ogni incasso con la sua
  ricevuta, il modulo per registrarne uno.
- **Servizi** (solo direzione) — il listino con durata, crediti, prezzo e
  materiali; e le stanze.
- **Professionisti** — la squadra, gli orari settimanali (direzione), la
  pubblicazione delle disponibilità (anche reception).

## Le regole dell’agenda

Un appuntamento entra in agenda se non si sovrappone a un altro dello stesso
professionista né a un altro nella stessa stanza. Sembra ovvio, ed è la cosa che
ogni gestionale prima o poi sbaglia — di solito su uno spostamento, dove
l’appuntamento da spostare si sovrappone a se stesso.

Il controllo (`src/lib/gestione/agenda.ts`) è una funzione pura, con i suoi
test, e sta nel codice e non solo nel database per una ragione precisa: deve
poter dire **con chi** si sovrappone, in una frase che la reception legge al
telefono con il paziente in linea. *«Il professionista è già impegnato in
quell’orario: Consulenza longevity con Mario Bianchi.»*

Una disdetta libera il posto. Una visita che finisce alle 10:00 non si
sovrappone a una che inizia alle 10:00.

## Le disponibilità

Gli **orari settimanali** sono la regola: martedì 9–13, giovedì 14–18. Le
**disponibilità** sono la regola applicata a un periodo, fetta per fetta, e sono
quelle che il paziente vede e prenota dalla sua area.

Le pubblica il banco, dalla scheda del professionista, scegliendo il servizio
(che decide la durata delle fette) e il periodo — al massimo tre mesi per volta,
perché oltre l’agenda cambia prima di arrivarci. Rieseguire è sicuro: le fette
che esistono già, o che toccano una visita già fissata, si saltano.

Le ore sono ore di Roma. La conversione (`romaComeIso`) passa dal fuso e non da
un offset fisso, perché a marzo e ottobre un offset fisso sposta tutti gli
appuntamenti di un’ora — e i test lo coprono su entrambi i lati dell’ora legale.

## Gli incassi

Un pagamento registrato al banco nasce già **pagato**, con la data e con un
numero di ricevuta progressivo per anno — `UNQ-2026-000123` — assegnato dal
database dentro la stessa transazione. Nessuno lo scrive a mano e nessuno lo
salta, anche se due persone incassano nello stesso secondo: il contatore
dell’anno è una riga con un lock.

La reception scrive un incasso e lo può correggere finché non è pagato; da lì lo
corregge l’amministrazione, perché un incasso pagato che sparisce è un buco di
cassa.

Gli importi si scrivono come si scrivono in Italia — `149`, `149,50`, `1.200` —
e la conversione in centesimi (`src/lib/gestione/importi.ts`) ha i suoi test.

## Le membership

Attivare un piano al banco tocca tre tabelle: la membership, i crediti che
assegna, e — se pagata subito — l’incasso. La funzione `activate_membership` le
tocca insieme o non le tocca. Farlo a mano significava farlo in tre schermate e
dimenticare i crediti nella seconda.

Se il paziente ha già un piano attivo, il nuovo lo sostituisce chiudendolo il
giorno prima. I crediti già assegnati restano nel registro: il registro è
append-only, e il saldo è la somma.

## Le persone nuove

Un paziente è anche un utente, e un professionista pure. Creare la riga di
anagrafica lo fa la reception con il suo client di sessione; creare l’utente
sotto lo fa il server con la chiave privilegiata, perché gli utenti li crea solo
il sistema di autenticazione. È l’unico punto del gestionale in cui quella chiave
compare, e compare **dopo** il controllo di ruolo, mai per decidere cosa
qualcuno può vedere.

La password non la sceglie nessuno al banco. La persona entra da `/accedi` con
*«Ho dimenticato la password»* e la imposta da un collegamento ricevuto per
posta. Se l’email è già registrata non è un errore: è la stessa persona che
torna, e si riusa il profilo.

Serve `SUPABASE_SERVICE_ROLE_KEY` nell’ambiente del server. Senza, il modulo lo
dice con una frase invece di fallire in silenzio.

## Cosa non c’è ancora

- **Un calendario visuale.** L’agenda è un elenco per giorno, perché un elenco
  si legge e si stampa; una griglia settimanale trascinabile è lavoro da fare
  quando i volumi lo chiedono.
- **La fattura.** La ricevuta è numerata; la fattura elettronica passa dal
  gestionale fiscale, che riceve gli incassi dagli eventi di dominio
  (`payment.*`).
- **L’invito per email.** Oggi la persona nuova imposta la password da sola;
  un invito con il collegamento già dentro è un’azione di comunicazione, e le
  azioni di comunicazione arrivano insieme ai canali.
