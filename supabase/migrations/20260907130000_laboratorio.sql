-- ═══════════════════════════════════════════════════════════════════
-- Il laboratorio: dalla richiesta al valore in cartella
--
-- Metà di questa catena esisteva già, ed è la metà difficile.
-- `measurements` tiene valore, unità, intervallo di riferimento e
-- provenienza; `document_analyses` e `measurement_proposals` leggono un
-- referto e propongono i valori; `can_approve_clinical_flag` decide chi
-- può firmare un valore fuori soglia. Quello che mancava è ciò che sta
-- **prima**: la richiesta.
--
--   Richiesta → Prelievo → Analisi → Risultato → Validazione → Cartella
--
-- Senza il primo anello il laboratorio non ha una coda. Un referto che
-- arriva si vede; un esame chiesto tre giorni fa e mai eseguito no — e
-- sono esattamente i casi che fanno male.
--
-- ---
--
-- Una tabella sola, e non una per stato.
--
-- La tentazione era `lab_requests`, `lab_collections`, `lab_results`:
-- sembra ordinato e produce tre righe per un esame, da tenere allineate
-- a mano. Qui c'è una riga che cambia stato, con un timestamp per ogni
-- passaggio — `collected_at`, `resulted_at`, `validated_at`. La domanda
-- «quanto ci mette un emocromo dalla richiesta al referto» diventa una
-- sottrazione fra due colonne della stessa riga.
--
-- I risultati non stanno qui. Vivono in `measurements`, dove stanno
-- tutte le misure di Unique, con un riferimento all'ordine che le ha
-- prodotte. Un pannello lipidico è un ordine e ventiquattro misure, e
-- copiare quei valori dentro l'ordine avrebbe significato averli in due
-- posti — cioè, prima o poi, averli diversi.
-- ═══════════════════════════════════════════════════════════════════

/*
 * Gli stati, e perché sono sei.
 *
 * `requested` e `collected` sono separati perché fra i due c'è una
 * persona che deve andare a fare un prelievo: è la coda
 * dell'infermieristica, e unirli l'avrebbe cancellata.
 *
 * `resulted` e `validated` sono separati perché fra i due c'è una firma.
 * Un valore risultato è un numero uscito da uno strumento; un valore
 * validato è un numero di cui qualcuno risponde — ed è solo il secondo
 * che entra in cartella e muove il Longevity Score.
 */
create type lab_order_status as enum (
  'requested',   -- chiesto, nessuno ha ancora prelevato
  'collected',   -- campione prelevato
  'processing',  -- in analisi
  'resulted',    -- risultati arrivati, non ancora firmati
  'validated',   -- firmati: sono in cartella
  'cancelled'
);

create table public.lab_orders (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients (id) on delete cascade,

  -- Il pannello come lo si chiede a voce: «Emocromo con formula».
  panel             text not null check (length(trim(panel)) > 0),
  /*
   * I codici del catalogo in `src/lib/score/metrics.ts`.
   *
   * Un array e non una tabella figlia, per la stessa ragione degli
   * orari di una terapia: sono pochi, non cambiano dopo la richiesta e
   * non hanno attributi propri. Servono a due cose — dire cosa si
   * aspetta, e accorgersi di cosa non è arrivato.
   */
  tests             text[] not null default '{}',

  -- Perché. È la riga che il laboratorio legge per capire se il valore
  -- che sta per firmare ha senso: un'emoglobina bassa in un'anemia nota
  -- è un'altra cosa dalla stessa in un controllo di routine.
  clinical_question text,

  priority          comms_priority not null default 'normal',
  status            lab_order_status not null default 'requested',

  requested_by      uuid references public.profiles (id) on delete set null,
  department_id     uuid references public.departments (id) on delete set null,

  -- Un timestamp per passaggio: la durata di ogni tratto è una
  -- sottrazione, non una join.
  requested_at      timestamptz not null default now(),
  collected_at      timestamptz,
  collected_by      uuid references public.profiles (id) on delete set null,
  processing_at     timestamptz,
  resulted_at       timestamptz,
  validated_at      timestamptz,
  validated_by      uuid references public.profiles (id) on delete set null,

  -- Il referto, quando arriva. Il file resta in `documents`: qui c'è il
  -- puntatore, così i permessi si governano in un posto solo.
  document_id       uuid references public.documents (id) on delete set null,
  -- Quando l'esame nasce da un consulto, resta attaccato alla domanda.
  consultation_id   uuid references public.clinical_consultations (id) on delete set null,

  notes             text,
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.lab_orders is
  'Una riga che cambia stato, con un timestamp per passaggio. I risultati non stanno qui: vivono in measurements, con un riferimento a questo ordine.';

create index lab_orders_by_patient on public.lab_orders (patient_id, requested_at desc);

create index lab_orders_aperti
  on public.lab_orders (status, requested_at)
  where status not in ('validated', 'cancelled');

create trigger lab_orders_touch
  before update on public.lab_orders
  for each row execute function public.touch_updated_at();

/*
 * Da quale ordine viene una misura.
 *
 * Nullable, e resterà nullable: la maggior parte delle misure di Unique
 * non nasce da una richiesta di laboratorio — arrivano da un referto
 * portato dal paziente, da una bilancia impedenziometrica, da un
 * questionario. Rendere obbligatorio il legame avrebbe costretto a
 * inventare un ordine per ogni peso registrato.
 */
alter table public.measurements
  add column if not exists lab_order_id uuid references public.lab_orders (id) on delete set null;

create index if not exists measurements_by_lab_order
  on public.measurements (lab_order_id)
  where lab_order_id is not null;

alter table public.lab_orders enable row level security;

create policy lab_orders_select on public.lab_orders
  for select using (public.can_access_patient(patient_id));

/*
 * Chi scrive.
 *
 * `can_write_clinical` e non `can_prescribe`: chiedere un emocromo non
 * è prescrivere un farmaco, e un nutrizionista che chiede un pannello
 * metabolico sta facendo il suo mestiere. La firma finale è un'altra
 * cosa e la protegge `validate_lab_order`, che chiede un medico.
 */
create policy lab_orders_write on public.lab_orders
  for all using (public.can_write_clinical(patient_id))
  with check (public.can_write_clinical(patient_id));

-- ═══════════════════════════════════════════════════════════════════
-- I gesti
-- ═══════════════════════════════════════════════════════════════════

/** Chiedere un esame. */
create or replace function public.request_lab_order(
  p_patient    uuid,
  p_panel      text,
  p_tests      text[] default '{}',
  p_question   text default null,
  p_priority   comms_priority default 'normal',
  p_department uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_reparto uuid;
  v_nome text;
begin
  if not public.can_write_clinical(p_patient) then
    raise exception 'Paziente non accessibile.';
  end if;
  if length(trim(coalesce(p_panel, ''))) = 0 then
    raise exception 'Indica cosa stai chiedendo.';
  end if;

  -- Se non è detto, va al reparto di diagnostica: è dove si eseguono, e
  -- un ordine senza destinatario non lo vede nessuno.
  v_reparto := coalesce(
    p_department,
    (select id from public.departments where slug = 'diagnostica' and is_active)
  );

  insert into public.lab_orders
    (patient_id, panel, tests, clinical_question, priority, requested_by, department_id)
  values
    (p_patient, trim(p_panel), coalesce(p_tests, '{}'),
     nullif(trim(coalesce(p_question, '')), ''), p_priority, auth.uid(), v_reparto)
  returning id into v_id;

  select coalesce(pr.full_name, 'Un paziente') into v_nome
  from public.patients pa join public.profiles pr on pr.id = pa.profile_id
  where pa.id = p_patient;

  -- Il reparto che esegue lo deve sapere: un ordine che aspetta che
  -- qualcuno apra la schermata giusta è un ordine che aspetta.
  if v_reparto is not null then
    perform public.notify_profiles(
      (select coalesce(array_agg(dm.profile_id), '{}'::uuid[])
         from public.department_members dm
        where dm.department_id = v_reparto and dm.ended_at is null),
      case when p_priority in ('urgent', 'critical')
           then 'Richiesta esame urgente — ' || trim(p_panel)
           else 'Nuova richiesta esame — ' || trim(p_panel) end,
      v_nome,
      '/pro/pazienti/' || p_patient::text || '/clinico',
      public.comms_severity(p_priority),
      'laboratorio'
    );
  end if;

  perform public.emit_event(
    'lab.requested', 'lab_order', v_id, p_patient, null,
    jsonb_build_object('panel', trim(p_panel), 'priority', p_priority)
  );

  return v_id;
end;
$fn$;

/**
 * Muovere un ordine lungo la catena.
 *
 * Gli stati vanno avanti, con una sola eccezione: da `resulted` si può
 * tornare a `processing` quando i risultati vanno rifatti. Tutte le
 * altre marce indietro non esistono — un campione prelevato non torna
 * da prelevare, e riscrivere la storia di un esame è esattamente ciò
 * che un registro deve impedire.
 *
 * `validated` non passa di qui: ha una funzione sua, perché chiede una
 * firma e non un clic.
 */
create or replace function public.advance_lab_order(
  p_order  uuid,
  p_status lab_order_status,
  p_note   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o public.lab_orders;
begin
  select * into o from public.lab_orders where id = p_order;
  if o is null then
    raise exception 'Richiesta non trovata.';
  end if;
  if not public.can_write_clinical(o.patient_id) then
    raise exception 'Paziente non accessibile.';
  end if;
  if o.status in ('validated', 'cancelled') then
    raise exception 'Questa richiesta è chiusa.';
  end if;
  if p_status = 'validated' then
    raise exception 'La validazione è una firma: passa da validate_lab_order.';
  end if;
  if p_status = 'cancelled' and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Serve il motivo dell''annullamento.';
  end if;

  update public.lab_orders
     set status        = p_status,
         collected_at  = case when p_status = 'collected'  then now() else collected_at end,
         collected_by  = case when p_status = 'collected'  then auth.uid() else collected_by end,
         processing_at = case when p_status = 'processing' then now() else processing_at end,
         resulted_at   = case when p_status = 'resulted'   then now() else resulted_at end,
         cancel_reason = case when p_status = 'cancelled'
                              then nullif(trim(coalesce(p_note, '')), '') else cancel_reason end,
         notes         = coalesce(nullif(trim(coalesce(p_note, '')), ''), notes)
   where id = p_order;

  -- Chi ha chiesto l'esame vuole sapere quando i risultati ci sono, non
  -- quando il campione è partito: gli altri passaggi non lo avvisano.
  if p_status = 'resulted' and o.requested_by is not null then
    perform public.notify_profiles(
      array[o.requested_by],
      'Risultati arrivati — ' || o.panel,
      'Da validare prima che entrino in cartella.',
      '/pro/pazienti/' || o.patient_id::text || '/clinico',
      'important',
      'laboratorio'
    );
  end if;

  perform public.emit_event(
    'lab.' || p_status::text, 'lab_order', p_order, o.patient_id, null,
    jsonb_build_object('panel', o.panel)
  );
end;
$fn$;

/**
 * Firmare.
 *
 * È il passaggio che fa entrare i valori in cartella, e l'unico che
 * chiede un medico: `can_approve_clinical_flag()` è la stessa funzione
 * che protegge l'approvazione di un valore fuori soglia, e usarla qui
 * significa che la regola resta una sola.
 *
 * Le misure legate all'ordine erano già in `measurements` — ci sono
 * arrivate dal referto, con la loro provenienza. Validare non le
 * ricopia: chiude l'ordine e lo dice a chi ha chiesto. Il valore in
 * cartella non nasce due volte.
 */
create or replace function public.validate_lab_order(
  p_order uuid,
  p_note  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o public.lab_orders;
  v_quante integer;
begin
  select * into o from public.lab_orders where id = p_order;
  if o is null then
    raise exception 'Richiesta non trovata.';
  end if;
  if not public.can_write_clinical(o.patient_id) then
    raise exception 'Paziente non accessibile.';
  end if;
  if not public.can_approve_clinical_flag() then
    raise exception 'Validare un esame è un atto medico: serve un medico o la direzione.';
  end if;
  if o.status = 'validated' then
    raise exception 'Questa richiesta è già validata.';
  end if;
  if o.status = 'cancelled' then
    raise exception 'Questa richiesta è stata annullata.';
  end if;

  select count(*)::integer into v_quante
  from public.measurements where lab_order_id = p_order;

  update public.lab_orders
     set status       = 'validated',
         validated_at = now(),
         validated_by = auth.uid(),
         notes        = coalesce(nullif(trim(coalesce(p_note, '')), ''), notes)
   where id = p_order;

  if o.requested_by is not null and o.requested_by <> auth.uid() then
    perform public.notify_profiles(
      array[o.requested_by],
      'Esame validato — ' || o.panel,
      case when v_quante > 0
           then v_quante::text || ' valori in cartella.'
           else 'Nessun valore associato: il referto è in cartella, i valori no.' end,
      '/pro/pazienti/' || o.patient_id::text || '/clinico',
      'important',
      'laboratorio'
    );
  end if;

  perform public.emit_event(
    'lab.validated', 'lab_order', p_order, o.patient_id, null,
    jsonb_build_object('panel', o.panel, 'valori', v_quante)
  );

  return v_quante;
end;
$fn$;

-- ── Lo storico di un parametro ────────────────────────────────────
/**
 * La serie di un parametro nel tempo.
 *
 * `13,8 → 13,1 → 12,4 → 11,9` è la cosa che un medico legge per prima e
 * che due valori a confronto non sanno dire: tre discese di fila sono
 * un'altra informazione rispetto a una discesa sola.
 *
 * Torna anche `delta` e `pct` rispetto alla rilevazione precedente,
 * calcolati in SQL con una window function invece che in memoria — la
 * pagina ne disegna sei o sette insieme, e farlo qui è una lettura
 * invece di sette.
 *
 * **Nessun giudizio.** Non dice «peggiorato»: dice di quanto è cambiato
 * e se sta fuori dall'intervallo stampato sul referto. Se un valore che
 * scende sia una buona o una cattiva notizia lo decide la curva di
 * normalizzazione del Longevity Score, che vive nel codice ed è
 * versionata con l'algoritmo — non una sottrazione.
 *
 * `stable` e non `security definer`: la `select` passa dalle policy di
 * chi chiama, quindi non c'è modo di leggere la serie di un paziente
 * che non si ha in cura.
 */
create or replace function public.metric_series(
  p_patient uuid,
  p_codes   text[] default null,
  p_limit   integer default 12
)
returns table (
  metric_code text,
  label       text,
  value       numeric,
  unit        text,
  ref_low     numeric,
  ref_high    numeric,
  measured_on date,
  delta       numeric,
  fuori       boolean
)
language sql
stable
set search_path = public
as $fn$
  with numerate as (
    select
      m.metric_code,
      m.label,
      m.value,
      m.unit,
      m.ref_low,
      m.ref_high,
      m.measured_on,
      m.value - lag(m.value) over (
        partition by m.metric_code order by m.measured_on
      ) as delta,
      (
        (m.ref_low  is not null and m.value < m.ref_low) or
        (m.ref_high is not null and m.value > m.ref_high)
      ) as fuori,
      row_number() over (
        partition by m.metric_code order by m.measured_on desc
      ) as posizione
    from public.measurements m
    where m.patient_id = p_patient
      and m.value is not null
      and (p_codes is null or m.metric_code = any (p_codes))
  )
  select
    metric_code, label, value, unit, ref_low, ref_high, measured_on, delta, fuori
  from numerate
  where posizione <= greatest(1, least(coalesce(p_limit, 12), 60))
  order by metric_code, measured_on;
$fn$;

comment on function public.metric_series is
  'La serie storica di uno o più parametri, con la variazione rispetto alla rilevazione precedente. Nessun giudizio: dire se una discesa è buona spetta alla curva di normalizzazione, non a una sottrazione.';

-- ── Realtime ──────────────────────────────────────────────────────
-- La coda del laboratorio cambia sotto gli occhi di chi la guarda.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.lab_orders';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
