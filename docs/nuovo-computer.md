# Continuare da un altro computer

Il repository porta con sé tutto il codice, le migrazioni e la documentazione.
Non porta — e non deve portare — le tre cose che vivono solo sul disco di chi
lavora: le chiavi, gli script SQL compilati con dentro email vere, e il
collegamento a Vercel. Questa pagina dice come rimetterle al loro posto.

## Il codice

```bash
git clone https://github.com/williamthebest27-glitch/UNIQUE-OS.git
cd UNIQUE-OS
npm install
npm run dev
```

Serve Node 26 (o comunque una versione recente) e Git. Il repository è
pubblico: per clonarlo non serve autenticarsi. Per **pubblicare** sì, quindi
prima del primo `git push` conviene fare `gh auth login`, oppure lasciare che
Git chieda le credenziali alla prima occasione.

Senza variabili d'ambiente l'applicazione parte lo stesso, in modalità
dimostrativa, su <http://localhost:3000>. È già abbastanza per leggere il
codice e vedere le pagine.

## Le chiavi

`.env.local` non è su GitHub e non deve arrivarci: `.gitignore` lo esclude
apposta. Due modi per ricostruirlo sul computer nuovo.

**Copiare il file.** Chiavetta, gestore di password, un canale privato: è il
modo che restituisce *tutte* le variabili, comprese quelle che su Vercel non
esistono.

**Riprenderlo da Vercel.**

```bash
npx vercel link
npx vercel env pull .env.local --environment=production
```

Due avvertenze. Senza `--environment=production` la CLI scarica l'ambiente di
sviluppo, che su questo progetto è vuoto, e il file arriva praticamente
bianco. E due variabili vivono solo in locale — `NEXT_PUBLIC_BILLING_PORTAL_URL`
e `UNIQUE_SYNC_TOKEN` — quindi vanno riscritte a mano prendendo i nomi da
`.env.example`.

## Gli script SQL compilati

`supabase/locale/` è ignorata da Git perché contiene le copie degli script con
dentro indirizzi email veri. Sul computer nuovo la cartella arriva vuota: i
modelli stanno in `supabase/`, e si ricompilano seguendo
[supabase/locale/LEGGIMI.md](../supabase/locale/LEGGIMI.md).

Il pacchetto delle migrazioni si rigenera da solo:

```bash
npm run db:pacchetto
```

## Prima di alzarsi dal computer vecchio

Tre controlli, in questo ordine:

```bash
git status          # niente da committare
git push            # tutti i rami allineati
git stash list      # dev'essere vuota
```

L'ultimo è quello che si dimentica. Uno stash resta sul disco dov'è stato
creato: non lo porta né il push né il pull, e sul computer nuovo non c'è modo
di accorgersi che esisteva.
