# L’Unique Longevity Score

Lo Score è il cuore dell’esperienza: è ciò che trasforma una serie di visite
separate in un percorso che il paziente vede muoversi nel tempo. Non è un numero
che un medico digita — è il risultato di un calcolo su misure tracciate.

> ⚠️ Curve di normalizzazione e pesi sono una **struttura di lavoro**, non un
> algoritmo clinicamente validato. Vanno confermati dal team medico prima di
> qualunque uso reale. Le decisioni aperte sono in fondo a questa pagina.

---

## I sette pilastri

| Pilastro | Chiave | Peso |
| --- | --- | --- |
| Metabolic Health | `metabolic_health` | 0,20 |
| Cardiovascular | `cardiovascular` | 0,18 |
| Movement | `movement` | 0,17 |
| Body Composition | `body_composition` | 0,13 |
| Nutrition | `nutrition` | 0,12 |
| Mental Wellbeing | `mental_wellbeing` | 0,12 |
| Lifestyle | `lifestyle` | 0,08 |

Le etichette restano in inglese: sono nomi di prodotto, come "Unique Longevity
Score", e devono leggersi uguali al paziente e sul materiale commerciale.

I pesi sono in [`src/lib/score/pillars.ts`](../src/lib/score/pillars.ts) e
riproducono l’esempio della visione — 82 · 74 · 71 · 86 · 76 · 80 · 69 → 78 —
che serve da ancora di regressione finché non arrivano quelli definitivi.

## Dalle misure al punteggio

```
misure grezze  →  normalizzazione  →  pilastro  →  Score
(mg/dL, bpm…)     (0–100 su curva)    (media       (media
                                       pesata)      pesata)
```

**Ogni fonte prevista dalla visione ha le sue metriche.** Il catalogo in
[`src/lib/score/metrics.ts`](../src/lib/score/metrics.ts) copre anamnesi, esami
ematici, composizione corporea e body scan, pressione, parametri
cardiovascolari, ECG, test da sforzo, spirometria, stile di vita, sonno,
attività fisica, alimentazione, questionari, valutazioni dei professionisti e
dispositivi indossabili: undici sorgenti, una trentina di parametri.

**La normalizzazione usa curve ad ancore**, non formule per casi speciali:

```ts
anchors: [[55, 30], [70, 85], [78, 100], [90, 100], [100, 68], [126, 20]]
```

Fra due ancore si interpola linearmente; oltre gli estremi si tiene il valore
dell’ancora, perché fuori dal campo osservato la curva non significa più nulla.
Lo stesso meccanismo regge le metriche "più basso è meglio" (LDL), quelle "più
alto è meglio" (VO₂ max) e quelle a campana (glicemia, sonno), che sono peggiori
sia in eccesso sia in difetto.

**Le metriche categoriali** — ECG, abitudine al fumo — hanno una mappa di valori
ammessi anziché una curva.

## Copertura: dire quando non si sa

Un punteggio calcolato su tre parametri su trenta non vale quanto uno completo,
e il paziente ha diritto di saperlo.

- Ogni pilastro riporta la propria **copertura**: la quota di peso delle metriche
  effettivamente disponibili.
- Sotto il **40%** il pilastro non viene calcolato: mostra "servono più dati"
  invece di un numero inventato. Uno zero sarebbe una bugia con l’aria di un dato.
- Lo Score complessivo esce solo se i pilastri calcolabili pesano almeno il
  **50%**, e riporta a sua volta la copertura complessiva.
- L’interfaccia elenca le **metriche mancanti ordinate per peso**: sono, nell’ordine,
  i prossimi dati da raccogliere.

## Freschezza

Una misura più vecchia di **18 mesi** viene scartata dal calcolo. Un pannello di
tre anni fa non descrive il presente, e lasciarlo pesare sul punteggio darebbe
un’immagine falsa — nella direzione sbagliata, di solito.

## Versione dell’algoritmo

Ogni punteggio salva in `computed_by` la versione con cui è stato prodotto
(oggi `uls-v2`). Serve a distinguere un miglioramento del paziente da un cambio
di formula: senza, la differenza è impossibile da ricostruire a posteriori.

Poiché il motore è fatto di funzioni pure e i dati grezzi restano in
`measurements`, **tutto lo storico si può ricalcolare** quando la formula cambia.

## Score dinamico

Ogni rilevazione è una riga di `longevity_scores`: lo storico è il prodotto, non
un effetto collaterale. La home mostra l’ultima riga; il grafico mostra la serie.

Il grafico **scala sui dati, non su 0–100**: su un asse pieno, quattro punti di
crescita diventerebbero una linea piatta e il progresso del paziente sparirebbe.

I "progressi ottenuti" confrontano il primo e l’ultimo valore di ogni parametro
e mostrano i quattro che si sono mossi di più. Che una variazione sia un
miglioramento **lo decide la curva, non il segno del numero**: la glicata che
scende migliora il punteggio, la massa muscolare che scende lo peggiora, e una
glicemia può peggiorare scendendo troppo.

## Verificabilità

Il motore è composto di funzioni pure: nessuna chiamata al database, nessuna
chiamata all’AI. È la proprietà che lo rende testabile.

```bash
npm test
```

I test coprono la coerenza del catalogo (pesi che sommano a 1, ancore ordinate e
dentro l’intervallo plausibile, ogni pilastro popolato), l’interpolazione, le
metriche a campana, le soglie di copertura, lo scarto dei valori impossibili e
delle misure scadute, e l’esempio della visione.

Sono già serviti: hanno intercettato pesi cardiovascolari che sommavano a 1,1 e
una definizione di copertura che dichiarava 100% avendo i dati al 90%.

## Decisioni aperte

1. **Pesi.** Quelli attuali sono plausibili ma non validati. Vanno decisi dal team
   medico, ed è probabile che debbano variare per età e sesso.
2. **Curve di normalizzazione.** Ogni ancora è una scelta clinica. Le curve
   andrebbero riviste marcatore per marcatore, e aggiustate per età e sesso.
3. **Età biologica.** Il campo esiste ed è mostrato in home, ma il metodo di stima
   è da definire — con cura, perché è il numero che il paziente racconterà agli altri.
4. **Frequenza.** Oggi il calcolo segue le rilevazioni. Con i dispositivi
   indossabili la frequenza diventa continua, e servirà distinguere lo Score
   "clinico" da quello "quotidiano".
5. **Pesi in database.** Oggi vivono nel codice, versionati con l’algoritmo.
   Quando il team medico vorrà tararli senza un rilascio, andranno spostati in
   tabella — mantenendo il versionamento.
