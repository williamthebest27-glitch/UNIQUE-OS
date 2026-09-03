# Il modello dell Unique Longevity Score

Lo Score è il cuore del prodotto: è ciò che trasforma una serie di visite separate
in un percorso che il paziente vede muoversi nel tempo. Questo documento descrive
il modello implementato nel codice e, soprattutto, **le assunzioni che vanno
validate clinicamente da Unique**.

> ⚠️ La composizione qui descritta è una struttura di lavoro, non un algoritmo
> clinicamente validato. Pesi, biomarcatori e soglie vanno definiti dal team medico
> prima di qualunque uso reale.

## Struttura

Un punteggio da 0 a 100, composto da **sei pilastri**. La scelta di sei è
deliberata: pochi abbastanza da essere ricordati dal paziente, molti abbastanza da
dare indicazioni azionabili.

| Pilastro | Chiave | Cosa misura |
| --- | --- | --- |
| Metabolismo | `metabolic` | Glicemia, insulina, HOMA-IR, emoglobina glicata, profilo lipidico |
| Cardiovascolare | `cardiovascular` | Pressione, VO₂ max, frequenza a riposo, variabilità cardiaca, ApoB |
| Composizione corporea | `body_composition` | Massa magra e grassa, distribuzione viscerale, densità ossea |
| Infiammazione | `inflammation` | PCR ad alta sensibilità, omocisteina, indici infiammatori |
| Assetto ormonale | `hormonal` | Tiroide, ormoni sessuali, cortisolo, vitamina D |
| Cognitivo e sonno | `cognitive_sleep` | Qualità e architettura del sonno, recupero, test cognitivi |

I pilastri sono definiti in `src/lib/domain/types.ts` (`PILLAR_KEYS`) e persistiti
nella tabella `score_pillars`.

## Come è modellato nel database

Tre principi hanno guidato lo schema:

**Ogni rilevazione è una riga, non un aggiornamento.** `longevity_scores` conserva
tutto lo storico. Il valore in home è semplicemente la riga più recente. Lo storico
non è un effetto collaterale del sistema: è il prodotto.

**I pilastri sono normalizzati, non un blob JSON.** La tabella `score_pillars`
permette di analizzare l andamento di un singolo pilastro nel tempo, su tutta la
popolazione dei pazienti — informazione preziosa per il Control Center e per il Brain.

**I biomarcatori grezzi restano separati.** `biomarkers` conserva i valori misurati
con la loro unità, gli intervalli di riferimento e il referto di provenienza. Lo
Score è una funzione calcolata su questi dati, non un dato inserito a mano: se
l algoritmo cambia, i punteggi storici si possono ricalcolare.

Il campo `computed_by` registra la versione dell algoritmo usata (`uls-v1`,
`uls-v2`, …). Serve a distinguere un miglioramento del paziente da un cambio di
formula — una confusione che, senza questo campo, diventa impossibile da sciogliere
a posteriori.

## Decisioni ancora aperte

1. **Pesi dei pilastri.** Il campo `weight` esiste in `score_pillars` ma non è
   ancora popolato. Vanno decisi dal team medico, ed è probabile che debbano
   variare per età e sesso.
2. **Normalizzazione dei biomarcatori.** Come si passa da un valore assoluto
   (es. PCR 1,2 mg/L) a un punteggio 0–100? Serve una curva per ciascun marcatore,
   idealmente aggiustata per età e sesso.
3. **Dati mancanti.** Se un pilastro non ha misure recenti, lo Score va calcolato
   sui pilastri disponibili, oppure va mostrato come incompleto? La seconda ipotesi
   è più onesta verso il paziente, e va rappresentata nell interfaccia.
4. **Frequenza di ricalcolo.** Il modello attuale prevede una rilevazione a ogni
   pannello ematochimico. Con i dati dei dispositivi indossabili la frequenza
   potrebbe diventare continua, e servirebbe distinguere lo Score "clinico" da
   quello "quotidiano".
5. **Età biologica.** Il campo `biological_age` esiste ed è mostrato in home, ma il
   metodo di stima è da definire — e va scelto con cura, perché è il numero che il
   paziente racconterà agli altri.

## Nell interfaccia

L anello in home mostra il punteggio complessivo; sotto, i sei pilastri con la
variazione rispetto al controllo precedente. Il grafico di andamento **scala sui
dati, non su 0–100**: su un asse pieno, quattro punti di crescita diventerebbero
una linea piatta e il progresso del paziente sparirebbe.

Le variazioni usano il segno meno tipografico (−) e sono colorate secondo il
significato clinico, non secondo la direzione: un calo dell emoglobina glicata è
verde, perché è una notizia buona. La logica è nel componente `DeltaPill`, che
tiene separati `direction` e `isImprovement` proprio per questo.
