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
| Nutrition | il calore della luce, dal verde-acqua all’oro |
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

1. **Condivisione della Signature.** Un’immagine statica esportabile — la
   figura del paziente, con il punteggio — è ciò che finisce su un telefono e
   viene mostrata a un amico. È la mossa commerciale che questa scelta rende
   possibile.
2. **Transizione fra rilevazioni.** Oggi la figura mostra lo stato attuale.
   Vedere la forma *cambiare* dal punteggio precedente a quello nuovo — una
   morfosi di due secondi — è il passo successivo.
3. **Tuning con figure reali.** I parametri dello shader sono tarati su dati
   dimostrativi. Con i primi pazienti veri andranno rivisti: la figura di un
   punteggio 45 deve restare bella, anche se cupa.
