# Le tue copie compilate

Qui dentro finiscono le versioni degli script SQL con dentro **email vere**:
la tua, quella dei colleghi, quella dei primi pazienti.

Tutto ciò che sta in questa cartella è ignorato da Git, tranne questo file.
Puoi compilarlo, rieseguirlo, tenerlo per mesi: non finirà mai su GitHub.

## Perché

Il repository è pubblico. Un indirizzo email è un dato personale, e un
commit è per sempre: la cronologia di Git conserva ciò che è stato scritto
anche dopo che il file viene corretto o cancellato. Riscrivere la storia di
un repository già condiviso è possibile ma sgradevole, e non toglie il dato
dai cloni altrui né dalla cache di GitHub.

Molto più semplice non farcelo arrivare.

## Come si usa

Copia il modello, poi compila la copia — non l'originale:

```bash
cp supabase/assegna-ruolo.sql supabase/locale/assegna-ruolo.sql
```

Apri `supabase/locale/assegna-ruolo.sql`, metti l'email vera, e incolla
**quello** nella SQL Editor di Supabase. Lo stesso vale per
`demo-paziente.sql`.

Se ti accorgi di aver compilato l'originale per sbaglio, prima salva la tua
versione e poi riporta il modello com'era:

```bash
cp supabase/assegna-ruolo.sql supabase/locale/assegna-ruolo.sql
git checkout -- supabase/assegna-ruolo.sql
```

Prima di ogni commit, `git status` mostra cosa stai per pubblicare. Se in
elenco compare un file di `supabase/` che avevi compilato, fermati.
