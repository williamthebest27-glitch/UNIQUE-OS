-- ═══════════════════════════════════════════════════════════════════
-- La terapia: cosa è stato prescritto, e cosa è stato davvero dato
--
-- Unique aveva `recommended_actions` — «cosa devi fare», il piano che il
-- paziente legge nella sua applicazione — e i documenti di tipo
-- `prescription`, che sono PDF. Nessuna delle due risponde alla domanda
-- che un'infermiera si fa alle otto del mattino: **cosa devo dare, a
-- chi, quanto, e a che ora.**
--
-- Due tabelle, e la distinzione fra loro è l'intera idea:
--
--   `prescriptions`             cosa è stato deciso. Farmaco, dose, via,
--                               frequenza, inizio, fine, chi l'ha
--                               prescritto. Cambia raramente.
--
--   `medication_administrations` cosa è successo. Una riga per ogni
--                               orario previsto, con dentro se è stata
--                               data, rifiutata, saltata, e perché.
--
-- Tenerle insieme sarebbe stato più corto e avrebbe reso impossibile la
-- sola domanda che conta davvero in una revisione: *quel giorno alle
-- 14, quella dose, è stata data?* Una prescrizione con un campo
-- «somministrata» risponde una volta sola, e la seconda volta cancella
-- la prima.
--
-- La riga «non data» vale quanto la riga «data». Un rifiuto registrato è
-- un fatto clinico — dice che il paziente c'era e ha detto no; una
-- somministrazione mancante e basta dice soltanto che nessuno ha scritto
-- niente. Per questo `medication_administrations` nasce con lo stato
-- `due` e non viene creata al momento del gesto: la riga esiste prima,
-- e resta lì anche se nessuno la tocca.
-- ═══════════════════════════════════════════════════════════════════

-- ── Vocabolario ───────────────────────────────────────────────────
create type medication_route as enum (
  'oral',          -- per os
  'sublingual',
  'topical',
  'subcutaneous',
  'intramuscular',
  'intravenous',
  'inhalation',
  'rectal',
  'ophthalmic',
  'other'
);

create type prescription_status as enum ('active', 'suspended', 'completed', 'cancelled');

/*
 * Gli stati di una somministrazione.
 *
 * `due` non è «in attesa»: è **prevista e non ancora avvenuta**, ed è lo
 * stato in cui una riga nasce. Le altre quattro sono tutte conclusioni,
 * e tre su quattro dicono che il farmaco non è stato dato — perché è
 * quello che succede davvero in un reparto, e un sistema che ammette
 * solo «fatto» costringe a mentire o a non scrivere.
 */
create type administration_status as enum (
  'due',        -- prevista, non ancora avvenuta
  'given',      -- somministrata
  'refused',    -- il paziente ha rifiutato
  'skipped',    -- saltata (a digiuno, assente, sospesa per quel giorno)
  'not_needed'  -- non necessaria (al bisogno, e non è servita)
);

-- ── Prescrizioni ──────────────────────────────────────────────────
create table public.prescriptions (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,

  -- Il farmaco come è stato scritto. Un catalogo di principi attivi con
  -- i suoi codici è la cosa giusta e non è questa migrazione: qui il
  -- testo libero è onesto, mentre una tabella `drugs` con dentro sei
  -- righe scritte a mano sarebbe stata un catalogo per finta.
  medication     text not null check (length(trim(medication)) > 0),
  dose           text not null check (length(trim(dose)) > 0),
  frequency      text not null check (length(trim(frequency)) > 0),
  route          medication_route not null default 'oral',
  instructions   text,

  /*
   * Gli orari del giorno in cui va data.
   *
   * Un array di `time` e non una tabella figlia: sono da uno a sei
   * valori, non cambiano quasi mai, e non hanno attributi propri.
   * Servono a una cosa sola — generare le righe di somministrazione — e
   * una tabella per quello avrebbe aggiunto una join a ogni lettura per
   * non dire niente di più.
   *
   * Vuoto significa «al bisogno»: nessuna riga viene generata, e la
   * somministrazione la registra chi la fa.
   */
  times          time[] not null default '{}',

  starts_on      date not null default current_date,
  ends_on        date,
  prescriber_id  uuid references public.profiles (id) on delete set null,
  status         prescription_status not null default 'active',
  -- Perché è stata sospesa o annullata. Una sospensione senza motivo è
  -- una decisione che fra un mese non si riesce più a leggere.
  status_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

comment on table public.prescriptions is
  'Cosa è stato deciso: farmaco, dose, via, frequenza, durata, prescrittore. Cosa è stato davvero dato sta in medication_administrations.';

create index prescriptions_by_patient
  on public.prescriptions (patient_id, status, starts_on desc);

create index prescriptions_active
  on public.prescriptions (patient_id)
  where status = 'active';

-- ── Somministrazioni ──────────────────────────────────────────────
create table public.medication_administrations (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  -- Ripetuto dalla prescrizione di proposito: ogni policy clinica di
  -- questo schema parte da `patient_id`, e passare da una join per
  -- valutarla avrebbe reso la regola dipendente dall'ordine in cui
  -- Postgres valuta due policy.
  patient_id      uuid not null references public.patients (id) on delete cascade,
  scheduled_at    timestamptz not null,
  status          administration_status not null default 'due',
  given_at        timestamptz,
  given_by        uuid references public.profiles (id) on delete set null,
  -- Obbligatorio quando non è stata data: vedi il trigger più sotto.
  reason          text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- La stessa dose, allo stesso orario, una volta sola.
  unique (prescription_id, scheduled_at)
);

comment on table public.medication_administrations is
  'Una riga per ogni orario previsto. Nasce «due» e resta: una somministrazione mancante deve potersi distinguere da una mai programmata.';

create index administrations_by_patient
  on public.medication_administrations (patient_id, scheduled_at desc);

create index administrations_due
  on public.medication_administrations (scheduled_at)
  where status = 'due';

create trigger prescriptions_touch
  before update on public.prescriptions
  for each row execute function public.touch_updated_at();

create trigger administrations_touch
  before update on public.medication_administrations
  for each row execute function public.touch_updated_at();

/*
 * Non si dice «non l'ho data» senza dire perché.
 *
 * Il vincolo sta in un trigger e non in un `check` perché deve poter
 * citare lo stato nel messaggio: un errore che dice «viola il vincolo
 * medication_administrations_check» manda a leggere lo schema, e chi lo
 * legge è un'infermiera che ha in mano un bicchiere d'acqua.
 */
create or replace function public.administrations_richiede_motivo()
returns trigger
language plpgsql
as $fn$
begin
  if new.status in ('refused', 'skipped')
     and length(trim(coalesce(new.reason, ''))) = 0 then
    raise exception 'Serve il motivo: una dose non data senza una ragione scritta non si riesce più a leggere fra un mese.';
  end if;

  -- L'ora del gesto la mette il database, non chi lo compie: una
  -- somministrazione datata a mano è la prima cosa che si contesta.
  if new.status = 'given' and new.given_at is null then
    new.given_at := now();
  end if;

  return new;
end;
$fn$;

create trigger administrations_motivo
  before insert or update on public.medication_administrations
  for each row execute function public.administrations_richiede_motivo();

-- ═══════════════════════════════════════════════════════════════════
-- Chi può fare cosa
-- ═══════════════════════════════════════════════════════════════════
/*
 * Prescrivere è un atto medico; somministrare no.
 *
 * È la distinzione che rende questa funzionalità utilizzabile: un
 * infermiere deve poter registrare cosa ha dato — è il suo mestiere — e
 * non deve poter cambiare la dose. Un nutrizionista fa parte del care
 * team e non prescrive farmaci.
 *
 * La regola sta nel database e non nell'interfaccia, per la stessa
 * ragione per cui ci sta `can_approve_clinical_flag`: è la differenza
 * fra una convenzione e una garanzia.
 */
create or replace function public.can_prescribe(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.can_write_clinical(target)
    and (
      public.is_staff()
      or exists (
        select 1 from public.professionals pr
        where pr.profile_id = auth.uid()
          and pr.discipline = 'physician'
          and pr.is_active
      )
    );
$fn$;

comment on function public.can_prescribe is
  'Prescrivere è un atto medico: care team più disciplina medica, o direzione. Somministrare invece è di chiunque scriva in cartella.';

alter table public.prescriptions              enable row level security;
alter table public.medication_administrations enable row level security;

-- Legge chi ha titolo sul paziente: il care team, la direzione, e il
-- paziente stesso — la sua terapia è sua, ed è la prima cosa che chiede.
create policy prescriptions_select on public.prescriptions
  for select using (public.can_access_patient(patient_id));

create policy prescriptions_write on public.prescriptions
  for all using (public.can_prescribe(patient_id))
  with check (public.can_prescribe(patient_id));

create policy administrations_select on public.medication_administrations
  for select using (public.can_access_patient(patient_id));

/*
 * Somministrare: chi scrive in cartella, medico o no.
 *
 * Nessuna policy di delete, e nemmeno per chi prescrive: una
 * somministrazione registrata non si cancella. Se è stata scritta per
 * errore si corregge lo stato e si scrive il perché nella nota — che è
 * come funziona un registro di reparto, e l'unico modo perché resti
 * leggibile fra un anno.
 */
create policy administrations_write on public.medication_administrations
  for insert with check (public.can_write_clinical(patient_id));

create policy administrations_update on public.medication_administrations
  for update using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

-- ═══════════════════════════════════════════════════════════════════
-- I gesti
-- ═══════════════════════════════════════════════════════════════════

/**
 * Generare le somministrazioni previste.
 *
 * Da una prescrizione con degli orari nascono le righe dei prossimi
 * giorni: una per orario per giorno, dentro la finestra fra inizio e
 * fine. `on conflict do nothing` la rende ripetibile — la si può
 * richiamare ogni notte, o a mano dopo aver corretto gli orari, senza
 * duplicare niente e senza toccare ciò che è già stato somministrato.
 *
 * Sette giorni avanti e non trenta: gli orari di una terapia cambiano, e
 * righe generate per il mese prossimo sarebbero da cancellare al primo
 * aggiustamento — cioè da distinguere fra quelle toccate e quelle no.
 * Una settimana è abbastanza perché il turno di notte veda il mattino.
 */
create or replace function public.generate_administrations(
  p_prescription uuid,
  p_days integer default 7
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r public.prescriptions;
  v_quante integer;
  v_fino date;
begin
  select * into r from public.prescriptions where id = p_prescription;
  if r is null then
    raise exception 'Prescrizione non trovata.';
  end if;
  if not public.can_write_clinical(r.patient_id) then
    raise exception 'Paziente non accessibile.';
  end if;

  -- Al bisogno: nessun orario, nessuna riga da prevedere.
  if array_length(r.times, 1) is null then
    return 0;
  end if;
  if r.status <> 'active' then
    return 0;
  end if;

  v_fino := least(
    coalesce(r.ends_on, current_date + greatest(coalesce(p_days, 7), 1)),
    current_date + greatest(coalesce(p_days, 7), 1)
  );

  insert into public.medication_administrations
    (prescription_id, patient_id, scheduled_at)
  select
    r.id,
    r.patient_id,
    /*
     * L'ora è quella della clinica, non quella del server: una
     * somministrazione delle otto è delle otto a Varese.
     *
     * `g.giorno::date` non è ridondante: `generate_series` su due date
     * con un intervallo restituisce `timestamptz`, non `date`. Senza il
     * cast, `data + ora` sommava un'ora a un istante che ne portava già
     * una — e Postgres rifiutava la riga con un errore che parlava di
     * sintassi invece che di tipi.
     */
    ((g.giorno::date + o.ora) at time zone 'Europe/Rome')
  from generate_series(greatest(r.starts_on, current_date), v_fino, interval '1 day')
       as g(giorno)
  cross join unnest(r.times) as o(ora)
  on conflict (prescription_id, scheduled_at) do nothing;

  get diagnostics v_quante = row_count;
  return v_quante;
end;
$fn$;

/**
 * Prescrivere.
 *
 * Una funzione e non un insert perché due cose vanno insieme: la
 * prescrizione e le somministrazioni che ne discendono. Una
 * prescrizione senza le sue righe è una decisione che nessuno vedrà
 * nella schermata dell'infermieristica — cioè una decisione che non
 * produce il gesto per cui è stata presa.
 */
create or replace function public.prescribe(
  p_patient      uuid,
  p_medication   text,
  p_dose         text,
  p_frequency    text,
  p_route        medication_route default 'oral',
  p_times        time[] default '{}',
  p_starts_on    date default current_date,
  p_ends_on      date default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.can_prescribe(p_patient) then
    raise exception 'Prescrivere è un atto medico: serve un medico del care team.';
  end if;
  if length(trim(coalesce(p_medication, ''))) = 0 then
    raise exception 'Indica il farmaco.';
  end if;
  if length(trim(coalesce(p_dose, ''))) = 0 then
    raise exception 'Indica la dose.';
  end if;
  if length(trim(coalesce(p_frequency, ''))) = 0 then
    raise exception 'Indica la frequenza.';
  end if;

  insert into public.prescriptions
    (patient_id, medication, dose, frequency, route, times,
     starts_on, ends_on, instructions, prescriber_id)
  values
    (p_patient, trim(p_medication), trim(p_dose), trim(p_frequency), p_route,
     coalesce(p_times, '{}'), coalesce(p_starts_on, current_date), p_ends_on,
     nullif(trim(coalesce(p_instructions, '')), ''), auth.uid())
  returning id into v_id;

  perform public.generate_administrations(v_id, 7);

  perform public.emit_event(
    'prescription.created', 'prescription', v_id, p_patient, null,
    jsonb_build_object('medication', trim(p_medication), 'dose', trim(p_dose))
  );

  return v_id;
end;
$fn$;

/**
 * Registrare cosa è successo a una dose.
 *
 * `given`, `refused`, `skipped`, `not_needed`. Le tre che non sono
 * `given` vogliono un motivo, e il trigger lo impone: qui la funzione lo
 * ripete prima, così l'errore arriva con la stessa frase in entrambe le
 * strade.
 *
 * Non si torna a `due`. Una dose su cui qualcuno si è già espresso non
 * torna «da fare»: se l'annotazione era sbagliata si cambia lo stato e
 * si scrive il perché nella nota — il registro tiene traccia di
 * entrambe le versioni, che è il punto di tenerlo.
 */
create or replace function public.record_administration(
  p_administration uuid,
  p_status         administration_status,
  p_reason         text default null,
  p_note           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a public.medication_administrations;
  v_farmaco text;
begin
  select * into a from public.medication_administrations where id = p_administration;
  if a is null then
    raise exception 'Somministrazione non trovata.';
  end if;
  if not public.can_write_clinical(a.patient_id) then
    raise exception 'Paziente non accessibile.';
  end if;
  if p_status = 'due' then
    raise exception 'Una dose registrata non torna «da somministrare»: cambia lo stato e scrivi il perché.';
  end if;
  if p_status in ('refused', 'skipped')
     and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Serve il motivo: una dose non data senza una ragione scritta non si riesce più a leggere fra un mese.';
  end if;

  update public.medication_administrations
     set status   = p_status,
         given_at = case when p_status = 'given' then now() else null end,
         given_by = auth.uid(),
         reason   = nullif(trim(coalesce(p_reason, '')), ''),
         note     = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
   where id = p_administration;

  select medication into v_farmaco
  from public.prescriptions where id = a.prescription_id;

  perform public.emit_event(
    'medication.' || p_status::text, 'medication_administration', p_administration,
    a.patient_id, null,
    jsonb_build_object('medication', v_farmaco, 'scheduled_at', a.scheduled_at)
  );

  /*
   * Un rifiuto lo deve sapere chi ha prescritto.
   *
   * È l'unico dei quattro stati che cambia una decisione clinica: se il
   * paziente non prende il farmaco, la terapia va ripensata, e chi l'ha
   * scritta è l'ultimo a saperlo se nessuno glielo dice.
   */
  if p_status = 'refused' then
    perform public.notify_profiles(
      (select array[prescriber_id] from public.prescriptions
        where id = a.prescription_id and prescriber_id is not null),
      'Dose rifiutata — ' || coalesce(v_farmaco, 'terapia'),
      coalesce(trim(p_reason), ''),
      '/pro/pazienti/' || a.patient_id::text || '/piano',
      'important',
      'terapie'
    );
  end if;
end;
$fn$;

/** Sospendere, riprendere o chiudere una terapia. */
create or replace function public.set_prescription_status(
  p_prescription uuid,
  p_status       prescription_status,
  p_reason       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r public.prescriptions;
begin
  select * into r from public.prescriptions where id = p_prescription;
  if r is null then
    raise exception 'Prescrizione non trovata.';
  end if;
  if not public.can_prescribe(r.patient_id) then
    raise exception 'Cambiare una terapia è un atto medico.';
  end if;

  update public.prescriptions
     set status = p_status,
         status_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_prescription;

  /*
   * Sospendere toglie le dosi future, non quelle passate.
   *
   * Le righe già registrate restano tutte: sono successe. Quelle ancora
   * `due` da adesso in avanti spariscono, perché non vanno più date — e
   * lasciarle avrebbe riempito la schermata dell'infermieristica di
   * dosi da non somministrare.
   */
  if p_status in ('suspended', 'cancelled', 'completed') then
    delete from public.medication_administrations
     where prescription_id = p_prescription
       and status = 'due'
       and scheduled_at > now();
  elsif p_status = 'active' then
    perform public.generate_administrations(p_prescription, 7);
  end if;

  perform public.emit_event(
    'prescription.' || p_status::text, 'prescription', p_prescription, r.patient_id, null,
    jsonb_build_object('medication', r.medication)
  );
end;
$fn$;

/**
 * Il giro delle somministrazioni.
 *
 * Le dosi previste in una finestra di ore, con dentro tutto ciò che
 * serve a darle: farmaco, dose, via, paziente. È la query della
 * schermata dell'infermieristica, e sta qui e non nell'applicazione
 * perché l'ordine — arretrate prima, poi per orario — è parte della
 * risposta e non della presentazione.
 *
 * `stable` e non `security definer`: la `select` dentro passa dalle
 * policy di chi la chiama, quindi un'infermiera vede il giro dei suoi
 * pazienti e non quello della clinica.
 */
create or replace function public.medication_round(
  p_from timestamptz default (now() - interval '12 hours'),
  p_to   timestamptz default (now() + interval '12 hours')
)
returns table (
  id              uuid,
  prescription_id uuid,
  patient_id      uuid,
  paziente        text,
  medication      text,
  dose            text,
  route           medication_route,
  instructions    text,
  scheduled_at    timestamptz,
  status          administration_status,
  overdue         boolean
)
language sql
stable
set search_path = public
as $fn$
  select
    a.id,
    a.prescription_id,
    a.patient_id,
    coalesce(pr.full_name, 'Paziente'),
    p.medication,
    p.dose,
    p.route,
    p.instructions,
    a.scheduled_at,
    a.status,
    (a.status = 'due' and a.scheduled_at < now())
  from public.medication_administrations a
  join public.prescriptions p on p.id = a.prescription_id
  join public.patients pa on pa.id = a.patient_id
  left join public.profiles pr on pr.id = pa.profile_id
  where a.scheduled_at between p_from and p_to
  order by
    (a.status = 'due' and a.scheduled_at < now()) desc,
    a.scheduled_at asc;
$fn$;

-- ── La terapia nella timeline ─────────────────────────────────────
/*
 * `patient_timeline` è nata con cinque fonti e adesso ne ha undici.
 *
 * La si elimina e ricrea come nella migrazione precedente, e per la
 * stessa ragione: `create or replace view` non sa aggiungere un ramo a
 * una union. Il testo qui sotto è quello di prima con un pezzo in più —
 * duplicarlo è sgradevole e resta il modo meno rischioso di cambiare una
 * vista che dieci schermate leggono.
 */
drop view if exists public.patient_timeline;

create view public.patient_timeline
with (security_invoker = true) as

  select
    s.patient_id,
    (s.measured_on::timestamp at time zone 'Europe/Rome') as occurred_at,
    'score'::text                                         as kind,
    'punteggio'::text                                     as category,
    ('Unique Longevity Score — ' || round(s.score)::text)  as title,
    s.summary                                             as detail,
    s.id                                                  as ref_id
  from public.longevity_scores s

  union all

  select
    a.patient_id, a.starts_at, 'appointment'::text, 'visite'::text,
    a.service_name, a.location, a.id
  from public.appointments a
  where a.status in ('scheduled', 'confirmed', 'completed')

  union all

  select
    d.patient_id, d.created_at, 'report'::text, 'referti'::text, d.title,
    case d.kind when 'imaging' then 'Imaging' else 'Laboratorio' end, d.id
  from public.documents d
  where d.kind in ('lab_report', 'imaging')

  union all

  select
    d.patient_id, d.created_at, 'prescription'::text, 'terapie'::text, d.title,
    case d.kind when 'prescription' then 'Prescrizione' else 'Piano di cura' end, d.id
  from public.documents d
  where d.kind in ('prescription', 'care_plan')

  union all

  select
    d.patient_id, d.created_at, 'document'::text, 'documenti'::text, d.title,
    null::text, d.id
  from public.documents d
  where d.kind in ('consent', 'invoice', 'other')

  union all

  select
    m.patient_id,
    (m.measured_on::timestamp at time zone 'Europe/Rome'),
    'measurement'::text,
    'esami'::text,
    ('Esami — ' || count(*)::text || case when count(*) = 1 then ' parametro' else ' parametri' end),
    (
      array_to_string((array_agg(m.label order by m.label))[1:3], ', ')
      || case when count(*) > 3 then '…' else '' end
    ),
    (array_agg(m.id order by m.id))[1]
  from public.measurements m
  group by m.patient_id, m.measured_on

  union all

  select
    r.patient_id, r.created_at, 'therapy'::text, 'terapie'::text,
    r.title, r.description, r.id
  from public.recommended_actions r

  union all

  /*
   * ── Le prescrizioni vere ───────────────────────────────────────
   *
   * Il titolo porta farmaco e dose perché è ciò che si cerca scorrendo
   * una storia clinica — «quando gli abbiamo dato il ramipril» è una
   * domanda che si fa guardando le date, non aprendo le righe.
   */
  select
    p.patient_id,
    (p.starts_on::timestamp at time zone 'Europe/Rome'),
    'medication'::text,
    'terapie'::text,
    (p.medication || ' ' || p.dose),
    (
      p.frequency
      || case when p.status <> 'active' then ' · ' || p.status::text else '' end
    ),
    p.id
  from public.prescriptions p

  union all

  select
    n.patient_id, n.created_at, 'note'::text, 'note'::text,
    coalesce(n.title, case n.kind
      when 'visit_summary' then 'Sintesi della visita'
      when 'assessment'    then 'Valutazione'
      else 'Nota clinica'
    end),
    left(n.body, 200), n.id
  from public.clinical_notes n

  union all

  select
    t.patient_id, t.last_message_at, 'thread'::text, 'comunicazioni'::text, t.subject,
    case t.category when 'clinical' then 'Con il paziente · clinica'
                    else 'Con il paziente · amministrativa' end,
    t.id
  from public.message_threads t

  union all

  select
    c.patient_id, c.last_message_at,
    case when c.kind = 'consultation' then 'consultation' else 'internal' end,
    'comunicazioni'::text, c.title,
    case when c.kind = 'consultation' then 'Consulto specialistico'
         else 'Comunicazione interna' end,
    c.id
  from public.conversations c
  where c.patient_id is not null

  union all

  select
    e.patient_id,
    (e.started_on::timestamp at time zone 'Europe/Rome'),
    'program_start'::text, 'percorso'::text,
    ('Inizio percorso — ' || p.name), p.description, e.id
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id

  union all

  select
    e.patient_id,
    (coalesce(e.ends_on, current_date)::timestamp at time zone 'Europe/Rome'),
    'program_end'::text, 'percorso'::text,
    ('Percorso concluso — ' || p.name), null::text, e.id
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.status = 'completed';

comment on view public.patient_timeline is
  'Storia del paziente in ordine cronologico, ricostruita dalle tabelle di dominio. `kind` dice da dove viene la riga e serve a disegnarla; `category` dice a quale domanda risponde e serve a filtrarla.';

-- ── Realtime ──────────────────────────────────────────────────────
-- Il giro delle somministrazioni si aggiorna da sé: due infermiere sullo
-- stesso turno devono vedere subito cosa l'altra ha già dato.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.medication_administrations';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
