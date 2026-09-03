# Account professionista, copilot e membership

---

## La giornata del professionista

`/pro` non è più un segnaposto: è l’agenda di chi lavora. Pazienti di oggi con
l’orario e il servizio, prossimi giorni, documenti nuovi caricati sui propri
pazienti, task aperti, pazienti da rivalutare, notifiche, e il conteggio dei
valori in attesa di revisione.

Nessuna di queste query filtra per care team: la Row Level Security restituisce
già solo i pazienti assegnati. Qui si decide **cosa** mostrare, non **chi** può
vederlo.

"Da rivalutare" è derivato, non gestito a mano: pazienti senza un nuovo
punteggio da oltre quattro mesi, con chi non ne ha mai avuto uno in cima.

## Permessi per disciplina

Ogni professionista ha una disciplina: medico, nutrizionista, osteopata,
psicologo, preparatore, infermiere.

La separazione è fra **leggere** e **scrivere**. Un nutrizionista vede tutto il
paziente — una storia clinica letta a metà non si capisce — ma non referta un
ECG.

| Disciplina | Può scrivere misure di |
| --- | --- |
| Medico | tutti i pilastri |
| Nutrizionista | Nutrition, Metabolic Health, Body Composition |
| Infermiere | Cardiovascular, Metabolic Health, Body Composition |
| Osteopata | Movement, Body Composition |
| Preparatore | Movement, Body Composition, Lifestyle |
| Psicologo | Mental Wellbeing, Lifestyle |
| Non dichiarata | nessuno |

Il default è restrittivo: un ruolo mancante non apre un varco.

### Dove vive ciascuna regola

**Nel database** quella che conta di più: approvare un valore **fuori soglia
clinica** richiede un medico. La policy su `measurement_proposals` lo impone
leggendo `review_reasons`, quindi non è aggirabile nemmeno da una chiamata
diretta all’API. Stessa cosa per decidere uno step del percorso.

**Nel codice** l’ambito per disciplina, perché dipende dal catalogo delle
metriche, che è versionato con l’algoritmo dello Score. Portarlo nel database
vorrebbe dire duplicare il catalogo in una tabella e tenerlo allineato per
sempre. È una linea tracciata di proposito, non una scorciatoia: la Row Level
Security garantisce l’isolamento fra pazienti — la parte critica per la
sicurezza — mentre l’ambito disciplinare è governo clinico.

Le regole di disciplina sono coperte da test: che ogni pilastro sia raggiungibile
da almeno una disciplina non medica, che una disciplina non dichiarata non
scriva nulla, che solo il medico approvi i valori fuori soglia.

## Dentro la cartella

Oltre a leggere sintesi, documenti e Score, il professionista può:

- **scrivere note e valutazioni** — nota, valutazione o sintesi di visita. La
  condivisione col paziente è una spunta spenta di default: si condivide per
  scelta, non per svista. Ciò che si scrive ai colleghi ha un registro diverso
  da ciò che si scrive al paziente;
- **correggere solo le proprie note** — nessuno riscrive le osservazioni di un
  collega (`notes_update_own`);
- **caricare documenti** sul paziente;
- **proporre un nuovo step del percorso** — proporre lo può fare chiunque nel
  care team, decidere è responsabilità medica.

## Copilot clinico

Dentro la cartella, un assistente contestuale. "Quali parametri sono
peggiorati?", "Confronta gli ultimi due esami", "Preparami una sintesi della
visita precedente" — le domande pronte sono pulsanti di invio, non riempitivi
del campo di testo: un clic e la risposta arriva.

Due vincoli lo distinguono da una chat qualsiasi.

**Vede solo ciò che vede chi lo interroga.** I dati arrivano dalle stesse query
del briefing, che passano dal client di sessione: è la Row Level Security a
decidere cosa entra nel prompt, non il prompt.

**Dichiara sempre da dove viene la risposta.** Le fonti sono parte dello schema
di uscita — tipo di dato, valore, data — non una gentilezza che il modello
concede quando se ne ricorda. Se i dati non bastano, lo dice e alza
`insufficient_data`: una risposta plausibile ma non fondata è peggio di nessuna
risposta.

Domanda e risposta finiscono in `copilot_messages` con le fonti. La
conversazione è di chi l’ha avuta: un collega non legge le domande che un altro
ha fatto sullo stesso paziente.

## Membership

Per ogni paziente: piano, stato, data di attivazione, scadenza, rinnovo
automatico e sua data, metodo di pagamento, crediti e servizi extra. Il paziente
vede tutto dalla propria sezione Membership.

### I crediti sono quattro numeri, non uno

| | |
| --- | --- |
| **Assegnati** | quelli entrati con il piano e con gli acquisti |
| **Utilizzati** | quelli già consumati |
| **Prenotati** | impegnati sulle visite già fissate e non ancora svolte |
| **Disponibili** | assegnati − utilizzati − prenotati |

I prenotati **non sono un movimento del registro**: sono derivati dagli
appuntamenti futuri confermati. È la scelta che evita il problema classico delle
prenotazioni — una visita spostata o annullata libererebbe un credito che
qualcuno deve ricordarsi di restituire. Derivandoli, il conto è sempre giusto
senza compensazioni manuali.

Confondere prenotati e disponibili è il modo classico per far prenotare al
paziente una visita che non può pagare: per questo l’interfaccia li mostra
separati, e la barra usa due colori.

### Pagamenti

Del metodo di pagamento il database conserva **solo circuito e ultime quattro
cifre**, con un vincolo che rifiuta qualunque altra forma. Numeri di carta,
scadenze e CVV non entrano qui: stanno dal gestore dei pagamenti, che è
attrezzato per custodirli e certificato per farlo.

## Da fare

1. **Collegare un gestore dei pagamenti.** Oggi stato, rinnovo e metodo si
   compilano a mano. Con Stripe o equivalente, `external_ref` diventa il ponte e
   lo stato arriva dai webhook.
2. **Assegnazione dei task.** Esistono e si chiudono, ma non c’è ancora
   un’interfaccia per crearli e assegnarli.
3. **Prenotazione dal paziente.** I crediti prenotati esistono; manca la
   schermata con cui il paziente fissa una visita e li impegna.
4. **Storico dei movimenti crediti.** La sezione Membership mostra i totali;
   il registro riga per riga merita una sua vista.
5. **Cronologia del copilot in pagina.** Le conversazioni sono salvate ma la
   cartella mostra solo l’ultima risposta.
