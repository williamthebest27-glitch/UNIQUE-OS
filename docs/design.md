# Il design di Unique OS

Un’app che tratta dati sanitari e vuole essere straordinaria. Le due cose non
sono in conflitto, ma vanno tenute insieme con criterio: l’esperienza deve
elevare, mai ostacolare — né il paziente ansioso che legge il proprio
punteggio, né il medico con cinque minuti prima della visita.

---

## Una sola mossa audace

Ogni effetto compete per la stessa attenzione. Una pagina con sei mosse da
manuale si legge come un demo reel; una pagina con una, eseguita con precisione,
si legge come costosa. Qui la mossa è una: **la Signature**. Tutto il resto è
quieto per scelta.

Niente cursore custom (non porterebbe informazione), niente scroll-jacking
(lo scroll deve pesare, mai resistere), niente binari orizzontali (non sono
contenuti da confrontare fianco a fianco).

## La Signature

Il Longevity Score non è più un anello con un numero. È un organismo generativo
in WebGL, **unico per ogni paziente**, la cui forma è derivata dai sette
pilastri. Non è decorazione: la forma è il dato.

| Pilastro | Cosa governa nella figura |
| --- | --- |
| Metabolic Health | quanto il campo scorre — l’intensità della deformazione |
| Cardiovascular | il ritmo del respiro — la pulsazione |
| Body Composition | la densità delle forme |
| Movement | la velocità di deriva |
| Nutrition | il calore della luce, dal rosa all’oro |
| Mental Wellbeing | la simmetria, la coerenza |
| Lifestyle | l’intensità della luminescenza |

Il punteggio complessivo governa la coerenza: un punteggio basso è turbolento e
cupo, uno alto è ordinato e luminoso. **La figura cambia mentre la salute
cambia** — è la cosa che rende tangibile il valore del percorso, più di
qualunque grafico.

Il seme è l’id del paziente: due persone con gli stessi numeri hanno comunque
due figure diverse, perché sono due persone.

### Come è costruita

Uno shader procedurale — rumore a dominio deformato, nessuna texture, nessun
asset — disegnato su un canvas a schermo intero dentro l’hero. Le regole prese
dal mestiere:

- **la sonda su un canvas usa-e-getta compila gli shader veri** prima di
  toccare quello in pagina: un canvas che ha consegnato un contesto WebGL non
  può più restituirne uno 2D, e un fallimento tardivo lascerebbe la sezione
  vuota;
- le dimensioni arrivano da un `ResizeObserver`, mai dal solo evento `resize`:
  un canvas che nasce a larghezza zero e cresce dopo resterebbe bloccato;
- DPR limitato a 1,75; niente rendering fuori schermo o a scheda nascosta;
- i pilastri si caricano una volta sola come uniform: non cambiano fra un
  frame e l’altro.

Quando WebGL non c’è, o il movimento è ridotto, al suo posto compare l’anello
su fondo scuro. Lo stesso numero, la stessa informazione.

Due dettagli che non si vedono ma contano. Le uniform sono impacchettate in
sette `vec4`: WebGL garantisce solo sedici vettori nel fragment shader e ogni
scalare ne occupa uno intero, quindi ventiquattro scalari sparsi non
compilerebbero su una GPU mobile. E un contesto WebGL perso non torna: il
componente non lo butta via allo smontaggio — React in sviluppo monta ogni
effetto due volte — e se la scheda era in background al primo tentativo
riprova quando torna visibile.

### La morfosi

Quando esiste una rilevazione precedente, la figura non appare com’è: appare
com’era, resta ferma sette decimi di secondo, poi si trasforma in poco più di
due secondi mentre il numero conta da un punteggio all’altro. Figura e
contatore leggono lo stesso orologio (`MorphProvider`), così arrivano
insieme. La morfosi è nello shader — ogni parametro è un `mix` fra lo stato
precedente e quello attuale — quindi la forma *cambia*, non si dissolve.
«Rivedi la trasformazione» la fa ripartire. Con reduced motion non c’è:
numero e figura sono subito quelli attuali.

### L’immagine esportabile

«Salva la tua Signature» genera un PNG 1080×1350 — il formato del feed — al
momento del clic, con lo stesso shader della pagina su un canvas fuori
schermo, e sopra il marchio, il punteggio e la data. Niente nome del
paziente: l’immagine è fatta per essere mostrata, e chi la mostra decide cosa
dire. Dove `navigator.share` accetta file (iOS, Android) si apre il foglio di
condivisione; altrove si scarica.

## Colore

Bianco e rosso. Il fondo è bianco, le superfici sono bianche, l’inchiostro è
un nero neutro; il rosso del marchio (`brand-*`, da `#fdf2f4` a `#5e0a17`) è
l’unico colore, e sta dove serve un accento: azioni, stati attivi, badge,
focus. L’oro resta per i momenti di valore — membership, crediti — con
parsimonia.

Una conseguenza da tenere sempre presente: **il rosso è il marchio, quindi
da solo non può voler dire "va male"**. Un miglioramento — un delta
positivo, un valore in regola — resta verde (`signal-positive`, un verde
neutro e calmo, non il vecchio jade). L’allarme usa il rosso profondo del
marchio e si riconosce dal contesto: icona, testo, posizione.

L’hero dello Score resta scuro. Sul bianco la Signature perderebbe la sua
luce; sul nero l’organismo in rosso e rosa è la mossa audace che il resto
della pagina, bianca e quieta, lascia parlare.

## Tipografia

**Fraunces** per il display: variabile, con l’asse ottico che cambia il disegno
fra un titolo enorme e una riga di testo, e gli assi `SOFT` e `WONK` che danno
al "78" un carattere che nessun sistema ha. **Inter** per l’interfaccia, dove
un carattere deve sparire.

La tipografia porta più valore percepito di qualunque shader. È la prima cosa
azzeccata, non l’ultima.

## Movimento

Un motore senza dipendenze, in `src/lib/motion/engine.ts`:

- **scroll con peso** — un lerp verso il bersaglio che muove `window.scrollTo`,
  mai un wrapper con transform: altrimenti `position: sticky` e `fixed`
  smettono di funzionare. Solo desktop: su touch l’inerzia nativa è già
  migliore di qualunque cosa si possa scrivere;
- **reveal all’ingresso** — ciò che è già nel viewport si rivela *subito*,
  con lo scaglionamento affidato al CSS via `--i`; l’osservatore serve solo
  per quello che arriva scorrendo. E una rete di sicurezza: dopo quattro
  secondi, ciò che è ancora nascosto viene mostrato comunque;
- **parole da dietro una maschera** — il padding con margine negativo tiene il
  taglio lontano dalle lettere, e lo spazio sta fuori dalla maschera, o le
  parole si incollano;
- **un unico ciclo rAF** a cui la Signature si aggancia, che pubblica la
  velocità di scroll come variabile CSS.

Il sipario iniziale dura un secondo e mezzo, una volta per sessione, solo sulla
home del paziente. Il tempo serve a caricare i font; la partenza è vincolata a
`document.fonts` con un limite, così un CDN lento non intrappola nessuno.

## Reduced motion

Con `prefers-reduced-motion`: niente sipario, niente scroll morbido, niente
Signature animata (al suo posto l’anello), reveal immediati. **Nessun contenuto
resta nascosto dietro un’animazione che non gira.** È una regola, non una
cortesia.

## Dove il movimento non va

L’area professionale e il Control Center ereditano tipografia e palette, non
la Signature né il sipario. Un medico fra due pazienti non ha bisogno di uno
shader; chi dirige ha bisogno di numeri densi su fondo scuro. Sono mestieri
diversi, e l’interfaccia lo rispetta.

## Da fare

1. **Tuning con figure reali.** I parametri dello shader sono tarati su dati
   dimostrativi. Con i primi pazienti veri andranno rivisti: la figura di un
   punteggio 45 deve restare bella, anche se cupa.
2. **Morfosi su più rilevazioni.** Oggi la trasformazione va dalla
   rilevazione precedente a quella attuale. Con una storia lunga, il paziente
   potrebbe scorrere l’intera sequenza — la figura di un anno fa che diventa
   quella di oggi.
3. **Verifica su dispositivi reali.** La Signature è stata provata su
   desktop. Va guardata su un iPhone di tre anni e su un Android economico:
   il tetto al DPR e il numero di ottave sono i due parametri da abbassare
   se scalda.
