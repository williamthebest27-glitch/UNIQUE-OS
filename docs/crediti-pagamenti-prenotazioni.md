# Credit engine, pagamenti, prenotazioni

---

## Il credit engine

Il credito ha tre stati, e i passaggi fra loro sono la macchina:

```
                prenotazione                visita svolta
  disponibile ────────────────► prenotato ──────────────────► utilizzato
       ▲                            │
       └──────── disdetta in ───────┘
                   tempo utile
```

**Ogni passaggio è una riga del registro, mai un aggiornamento.** Lo storico
delle modifiche non è una tabella a parte che qualcuno deve ricordarsi di
scrivere: è il registro stesso. Il saldo è la somma dei movimenti, quindi non
esiste un numero da tenere allineato.

I quattro totali della vista `credit_balances` escono tutti da lì:

| | |
| --- | --- |
| **Assegnati** | acquisti, accrediti, rimborsi, correzioni, scadenze |
| **Utilizzati** | i `consumption` |
| **Prenotati** | `reservation` meno `reservation_release` |
| **Disponibili** | assegnati − utilizzati − prenotati |

### Dove vive la macchina

In un trigger su `appointments`, non nel codice dell’applicazione. È la
differenza fra una convenzione e una garanzia: che l’appuntamento arrivi dalla
prenotazione del paziente, da un professionista o dalla sincronizzazione col
gestionale, il credito si muove allo stesso modo. Non c’è una strada che lo
aggiri.

| Cambio di stato | Cosa succede al credito |
| --- | --- |
| Nuovo appuntamento in agenda | prenotazione (disponibile → prenotato) |
| Visita svolta | rilascio + utilizzo |
| Mancata presentazione | rilascio + utilizzo — il credito è dovuto |
| Disdetta entro 24 ore prima | rilascio: torna disponibile |
| Disdetta oltre i termini | rilascio + utilizzo |
| Riprogrammazione | nuova prenotazione |

La soglia è in `credit_cancellation_hours()`: cambiarla lì la cambia ovunque.
Il paziente la legge **prima** di confermare — l’avviso sulla disdetta tardiva
compare accanto al pulsante, perché un addebito a sorpresa è un addebito
sbagliato anche quando è giusto.

### Correzioni manuali

L’amministrazione corregge aggiungendo una riga di tipo `adjustment`, non
modificando il saldo. Il motivo è obbligatorio e lo impone un vincolo sul
database: una correzione senza spiegazione è un buco nel registro.

## Pagamenti

`payments` copre membership, rinnovi, servizi singoli, pacchetti, upgrade e
acquisti extra, con stato, tentativi e motivo del fallimento.

**Gli avvisi partono da soli.** Un trigger su `payments` avvisa
l’amministrazione quando un incasso fallisce e quando rientra; un trigger su
`memberships` quando una viene disdetta o scade. Per le scadenze prevedibili
c’è `run_billing_checks()`, da eseguire una volta al giorno: segnala carte in
scadenza entro il mese e membership che finiscono entro trenta giorni.

```sql
select public.run_billing_checks();
```

### Il metodo di pagamento, e cosa non c’è

Il paziente vede la carta salvata e può aggiornarla. Il pulsante porta al
**portale del gestore dei pagamenti** (`NEXT_PUBLIC_BILLING_PORTAL_URL`), non a
un modulo di Unique OS.

Non esiste, e non deve esistere, un campo dove digitare il numero della carta.
Il database conserva circuito, ultime quattro cifre e mese di scadenza — quanto
basta a riconoscerla e ad avvisare prima che scada. Numeri completi, CVV e dati
di pagamento stanno dal gestore, che è attrezzato e certificato per custodirli.
Portarli qui significherebbe assumersi un obbligo di conformità che non serve a
nulla.

## Prenotazioni

Unique OS **non sostituisce il gestionale**: lo legge. La colonna `source` dice
chi è la fonte di verità di ogni riga, `external_ref` la ricollega al sistema
d’origine.

Il sistema conosce le sette cose che servono: disponibilità, professionista,
servizio, appuntamento, stato, disdetta con motivo e ora, presenza o mancata
presentazione.

### L’integrazione

```
POST /api/integrazioni/prenotazioni
x-unique-sync-token: <UNIQUE_SYNC_TOKEN>

{
  "appointments": [{
    "external_ref": "GEST-8891",
    "patient_code": "UQ-0001",
    "professional_license": "MI-12345",
    "service_slug": "consulenza-longevity",
    "starts_at": "2026-10-02T09:30:00+02:00",
    "ends_at":   "2026-10-02T10:30:00+02:00",
    "status": "confirmed"
  }],
  "slots": [{
    "external_ref": "SLOT-4410",
    "professional_license": "MI-12345",
    "service_slug": "osteopatia",
    "starts_at": "2026-10-03T15:00:00+02:00",
    "ends_at":   "2026-10-03T15:50:00+02:00"
  }]
}
```

Risponde con quanti record ha scritto e l’elenco degli scartati con il motivo —
un paziente non trovato non fa fallire l’intero invio.

I riferimenti si risolvono per **codice paziente**, **numero di licenza** e
**slug del servizio**: il gestionale non deve conoscere gli id interni di
Unique OS.

Il token si confronta a tempo costante: un confronto normale, su un segreto,
perde informazione a ogni tentativo. L’endpoint è escluso dal controllo di
sessione del proxy perché parla con un sistema, non con una persona, e si
autentica con un token proprio.

**Un appuntamento che entra da qui fa scattare il credit engine come tutti gli
altri.** È il motivo per cui l’integrazione vale la pena: i due sistemi devono
raccontare la stessa storia sui crediti.

### Cosa può fare il paziente

Vede le visite in programma e lo storico con l’esito, prenota gli slot liberi e
disdice — con l’avviso su cosa succede al credito. Prenotare e disdire passano
da due funzioni del database, non da un aggiornamento sulla tabella: una policy
che permettesse al paziente di modificare il proprio appuntamento gli
permetterebbe di cambiarne anche il servizio o il costo in crediti.

La prenotazione controlla i crediti **disponibili**, non il saldo: prenotati e
disponibili sono cose diverse, e confonderli significa far prenotare due volte
lo stesso credito.

## Da fare

1. **Collegare davvero il gestore dei pagamenti.** Stato, rinnovo e metodo oggi
   si compilano a mano; `external_ref` è il ponte già predisposto e i webhook
   scriverebbero `payments`, che fa già partire gli avvisi.
2. **Schedulare `run_billing_checks()`.** Serve un job giornaliero — pg_cron
   sul progetto Supabase, o un cron esterno.
3. **Sincronizzazione in uscita.** Oggi il gestionale scrive in Unique OS; una
   prenotazione fatta qui non torna indietro. Serve un webhook nell’altra
   direzione, o il gestionale resta la sola porta d’ingresso per le agende.
4. **Regole di disdetta per servizio.** La soglia è unica per tutta la clinica;
   un test da sforzo potrebbe meritarne una diversa da un colloquio.
5. **Scadenza dei crediti.** Il tipo `expiry` esiste nel registro, ma nessun job
   lo usa: le regole di decadenza vanno decise.
