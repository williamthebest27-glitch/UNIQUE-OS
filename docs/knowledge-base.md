# La knowledge base e il tempo

La memoria aziendale di Unique: procedure, listini, servizi, FAQ, protocolli,
brand book, linee guida marketing, script, policy.

Il problema non è conservare le informazioni. È sapere **quale è vera adesso**.

> Il Longevity Score è costato 129 €. Adesso costa 149 €.
> Entrambe le frasi sono state vere. Una sola lo è oggi.

Un sistema che risponde 129 non ha un problema di conoscenza: ha un problema di
tempo. Per questo qui un'informazione non è una riga che si aggiorna, ma una
**catena di versioni con validità dichiarata**.

---

## Il modello

```
knowledge_entries          l'informazione: slug, tipo, proprietario, visibilità
  └── knowledge_versions   le versioni: testo, dati, da quando a quando vale
        └── knowledge_current   una riga per informazione: ciò che è vero oggi
```

Ogni versione porta con sé le cinque cose che rendono un'informazione
utilizzabile, e che la visione chiedeva esplicitamente:

| | Dove sta |
| --- | --- |
| versione | `knowledge_versions.version` |
| data | `valid_from`, `valid_to` |
| proprietario | `knowledge_entries.owner_id` — chi risponde se è sbagliata |
| stato | `draft`, `active`, `superseded`, `archived` |
| aggiornamento | `approved_at`, `approved_by`, `change_note` |

**Si scrive sulla catena, si legge dalla vista.** `knowledge_current` restituisce
per ogni informazione la versione attiva e valida alla data corrente. Il Brain
non legge da nessun'altra parte: ciò che non è lì non è vero oggi, e non può
finire in una risposta per distrazione di chi ha scritto una query.

## Pubblicare

`publish_knowledge_version(uuid)` fa quattro cose in una transazione:

1. chiude la versione precedente **il giorno prima** che entri in vigore la
   nuova — non le lascia sovrapposte, così "quanto costava a giugno" ha una
   risposta sola;
2. attiva la nuova, registrando chi ha autorizzato e quando;
3. tocca l'informazione, perché l'elenco sappia che si è mossa;
4. emette `knowledge.published`, che il resto del sistema può ascoltare.

Sta nel database e non nell'applicazione per la stessa ragione per cui ci sta il
credit engine: vale anche per chi scrive dal database.

## Chi scrive cosa

- **Direzione** — crea, modifica, pubblica, archivia.
- **Marketing** — apre voci e propone versioni su brand, marketing, script e FAQ.
  Sempre in bozza: pubblicare richiede la direzione.
- **Chiunque lavori in Unique** — legge.
- **Paziente** — legge solo le voci marcate `public`, quelle che finirebbero
  comunque sul sito.

È la stessa separazione fra proposta e approvazione che vale per i dati clinici,
applicata alle informazioni commerciali.

## Invecchiamento

Un listino che nessuno tocca da otto mesi non è necessariamente sbagliato, ma
nessuno può giurare che sia giusto. `REVISIONE_GIORNI` in
[`src/lib/knowledge/validity.ts`](../src/lib/knowledge/validity.ts) fissa per
ogni tipo l'intervallo oltre il quale l'informazione va riconfermata: 180 giorni
per un listino, 545 per il brand book. Le voci scadute compaiono in cima alla
knowledge base, e il Brain lo dichiara quando le cita.

## Difetti della catena

Due cose possono andare storte in una storia di versioni, e si vedono solo
guardandola tutta insieme:

- un **buco** — a una certa data il sistema non sapeva rispondere;
- una **sovrapposizione** — a una certa data sapeva rispondere in due modi.

`anomalieCatena` le trova, la scheda dell'informazione le mostra. Sono difetti
di come è stata scritta la storia, non del contenuto.

## Come si cita

Ogni voce espone una riga di provenienza pronta da usare:

```
versione 2, in vigore dal 2026-03-15
versione 1, in vigore dal 2025-01-01 — non riconfermata da 611 giorni
```

Una risposta che afferma qualcosa senza questa riga è una risposta che chiede di
essere creduta sulla parola. In clinica non basta; in azienda nemmeno.

## Decisioni ancora aperte

1. **I contenuti seminati vanno confermati.** Le voci create dalla migrazione —
   listino, membership, procedure — vengono dal brief del founder e portano una
   nota che lo dice. Prezzi e regole vanno riletti dall'amministrazione prima di
   considerarli veri.
2. **Il proprietario.** Oggi le voci seminate non hanno proprietario. Ognuna
   dovrebbe averne uno, perché un'informazione senza proprietario invecchia
   senza che nessuno se ne accorga.
3. **La ricerca è testuale.** `search_knowledge` usa il dizionario italiano di
   Postgres. Funziona bene sulle parole giuste e male sui sinonimi: quando la
   base sarà grande servirà affiancarle una ricerca per significato.
