-- =====================================================================
-- MultiWatch — Demo mode (ไม่มีล็อกอิน, อ่านอย่างเดียวจากเบราว์เซอร์)
--
-- รันครั้งเดียวใน Supabase → SQL Editor (รันซ้ำได้ ไม่พัง)
--
-- สิ่งที่ไฟล์นี้ทำ
--   1) ล้าง RLS policy เดิมทั้งหมด แล้วตั้งใหม่: anon / authenticated อ่านได้อย่างเดียว
--      การเขียนทั้งหมดต้องผ่าน server (service role) เท่านั้น
--   2) ลบ view / function ของหน้า admin และ executive ที่ไม่ใช้แล้ว
--   3) staff_profiles: ปิดไม่ให้ API อ่าน/เขียน และบังคับ role = 'nurse' สำหรับแถวใหม่
--   4) RPC get_dashboard() / get_audit_log() — ดึงข้อมูลทั้งหน้าใน 1 request
--   5) ตัวจำลองข้อมูล (แทน scripts/simulate-writer.mjs) อยู่ใน schema "sim"
--      ซึ่งไม่ได้เปิดผ่าน API — รันโดย pg_cron ทุก 5 วินาที
--   6) งานลบข้อมูลเก่าทุก 10 นาที กันฐานข้อมูลเต็ม
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RLS: อ่านอย่างเดียว
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('wards','patients','vitals_readings','iv_readings','alerts','staff_profiles')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.wards           enable row level security;
alter table public.patients        enable row level security;
alter table public.vitals_readings enable row level security;
alter table public.iv_readings     enable row level security;
alter table public.alerts          enable row level security;
alter table public.staff_profiles  enable row level security;

create policy "demo: public read" on public.wards           for select to anon, authenticated using (true);
create policy "demo: public read" on public.patients        for select to anon, authenticated using (true);
create policy "demo: public read" on public.vitals_readings for select to anon, authenticated using (true);
create policy "demo: public read" on public.iv_readings     for select to anon, authenticated using (true);
create policy "demo: public read" on public.alerts          for select to anon, authenticated using (true);
-- staff_profiles: ไม่มี policy = API มองไม่เห็นเลย (ยกเว้น service role)

-- ชั้นที่สอง: ถอนสิทธิ์เขียนระดับตาราง เผื่อมีใครเผลอเพิ่ม policy ในอนาคต
revoke insert, update, delete, truncate
  on public.wards, public.patients, public.vitals_readings, public.iv_readings, public.alerts
  from anon, authenticated;
revoke all on public.staff_profiles from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) ลบของหน้า admin / executive ที่ไม่ใช้แล้ว
-- ---------------------------------------------------------------------
drop view if exists public.staff_directory;
drop view if exists public.executive_alert_stats_daily;
drop view if exists public.executive_ward_ranking;
drop function if exists public.get_staff_name(uuid);

-- ---------------------------------------------------------------------
-- 3) เหลือ role nurse อย่างเดียว
--    NOT VALID = ไม่ตรวจแถวเดิม (ไม่ทำให้ migration พัง) แต่แถวใหม่/ที่แก้ต้องเป็น nurse
-- ---------------------------------------------------------------------
alter table public.staff_profiles drop constraint if exists staff_profiles_nurse_only;
alter table public.staff_profiles
  add constraint staff_profiles_nurse_only check (role::text = 'nurse') not valid;

-- ---------------------------------------------------------------------
-- Index สำหรับ query ที่ใช้บ่อย
-- ---------------------------------------------------------------------
create index if not exists vitals_readings_patient_time_idx on public.vitals_readings (patient_id, recorded_at desc);
create index if not exists iv_readings_patient_time_idx     on public.iv_readings (patient_id, recorded_at desc);
create index if not exists alerts_patient_time_idx          on public.alerts (patient_id, created_at desc);
create index if not exists alerts_open_idx                  on public.alerts (patient_id, param) where resolved_at is null;
create index if not exists vitals_readings_time_idx         on public.vitals_readings (recorded_at);
create index if not exists iv_readings_time_idx             on public.iv_readings (recorded_at);

-- ---------------------------------------------------------------------
-- 4) RPC สำหรับหน้าเว็บ
-- ---------------------------------------------------------------------

-- ทั้งแดชบอร์ดใน request เดียว (เดิมยิง 1 + 3×จำนวนเตียง)
-- security invoker = ผ่าน RLS ตามปกติ
create or replace function public.get_dashboard(p_points int default 30, p_alerts int default 20)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'patient', to_jsonb(p),
    'vitals', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.recorded_at)
      from (select * from public.vitals_readings
            where patient_id = p.id
            order by recorded_at desc
            limit least(greatest(p_points, 1), 200)) v
    ), '[]'::jsonb),
    'iv', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.recorded_at)
      from (select * from public.iv_readings
            where patient_id = p.id
            order by recorded_at desc
            limit least(greatest(p_points, 1), 200)) i
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select * from public.alerts
            where patient_id = p.id
            order by created_at desc
            limit least(greatest(p_alerts, 1), 100)) a
    ), '[]'::jsonb)
  ) order by p.created_at), '[]'::jsonb)
  from public.patients p;
$$;

-- ประวัติการแจ้งเตือน + ชื่อผู้ป่วย + ชื่อพยาบาล
-- security definer เพราะ staff_profiles ปิดไว้ แต่คืนแค่ full_name เท่านั้น
create or replace function public.get_audit_log(p_limit int default 100)
returns table (
  id bigint,
  patient_id uuid,
  patient_name text,
  level text,
  param text,
  category text,
  msg text,
  created_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by_name text,
  resolved_at timestamptz,
  resolved_by_name text,
  resolution_note text,
  escalated boolean,
  escalated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.patient_id, p.name, a.level, a.param, a.category, a.msg, a.created_at,
         a.acknowledged_at, ack.full_name,
         a.resolved_at, res.full_name,
         a.resolution_note, a.escalated, a.escalated_at
  from public.alerts a
  left join public.patients p         on p.id = a.patient_id
  left join public.staff_profiles ack on ack.id = a.acknowledged_by
  left join public.staff_profiles res on res.id = a.resolved_by
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.get_dashboard(int, int) from public;
revoke all on function public.get_audit_log(int)      from public;
grant execute on function public.get_dashboard(int, int) to anon, authenticated, service_role;
grant execute on function public.get_audit_log(int)      to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) ตัวจำลองข้อมูล — schema "sim" ไม่ได้เปิดผ่าน API
-- ---------------------------------------------------------------------
create schema if not exists sim;
revoke all on schema sim from public;
do $$ begin
  execute 'revoke all on schema sim from anon, authenticated';
exception when undefined_object then null;  -- เผื่อรันนอก Supabase
end $$;

create table if not exists sim.state (
  patient_id    uuid primary key references public.patients(id) on delete cascade,
  anomaly_param text,
  anomaly_scale numeric not null default 1,
  ticks_left    int not null default 0,
  cooldown      int not null default 5
);

-- ปรับความถี่/ความแรงของเหตุผิดปกติได้ที่นี่
create table if not exists sim.config (
  id                 boolean primary key default true check (id),
  anomaly_chance     numeric not null default 0.04,  -- โอกาสเกิดเหตุต่อเตียงต่อ tick
  anomaly_ticks      int     not null default 8,     -- เหตุผิดปกติกินเวลากี่ tick
  cooldown_ticks     int     not null default 20,    -- พักกี่ tick ก่อนเกิดเหตุใหม่ได้
  reversion          numeric not null default 0.1    -- แรงดึงกลับสู่ค่าปกติ (0 = ไม่ดึง)
);
insert into sim.config default values on conflict do nothing;

create or replace function sim.clamp(v numeric, lo numeric, hi numeric)
returns numeric language sql immutable
as $$ select least(hi, greatest(lo, v)) $$;

-- random walk + ดึงกลับหาค่าปกติ + drift ตอนเกิดเหตุ
create or replace function sim.step(prev numeric, base numeric, spread numeric, drift numeric, k numeric)
returns numeric language sql volatile
as $$ select prev + (random() - 0.5) * spread + (base - prev) * k + drift $$;

create or replace function sim.upsert_alert(
  p_patient uuid, p_level text, p_param text, p_category text, p_msg text
) returns void
language plpgsql
set search_path = ''
as $$
declare ex record;
begin
  select a.id, a.level, a.acknowledged_at into ex
  from public.alerts a
  where a.patient_id = p_patient and a.param = p_param and a.resolved_at is null
  order by a.created_at desc, a.id desc
  limit 1;

  if found then
    if ex.level = p_level then return; end if;
    -- พยาบาลรับเรื่องแล้ว ให้คนหน้างานตัดสินใจเอง ไม่แตะ
    if ex.acknowledged_at is not null then return; end if;
    update public.alerts
       set resolved_at = now(),
           resolution_note = format('เปลี่ยนระดับเป็น %s อัตโนมัติ', p_level)
     where id = ex.id;
  end if;

  insert into public.alerts
    (patient_id, level, param, category, msg, recipients, escalate_after_min, escalate_to)
  values (
    p_patient, p_level, p_param, p_category, p_msg,
    case when p_level = 'critical' then array['พยาบาล','แพทย์'] else array['พยาบาล'] end,
    case when p_level = 'critical' then 15 else 45 end,
    case when p_level = 'critical' then 'ทีม Rapid Response / แพทย์เวร' else 'แพทย์' end
  );
end $$;

create or replace function sim.auto_resolve(p_patient uuid, p_param text)
returns void
language sql
set search_path = ''
as $$
  update public.alerts
     set resolved_at = now(),
         resolution_note = 'ค่ากลับสู่ปกติอัตโนมัติ (auto-resolved by system)'
   where patient_id = p_patient and param = p_param and resolved_at is null;
$$;

-- threshold ต้องตรงกับ src/lib/status.ts
create or replace function sim.check_vent(p_patient uuid, p_param text, v numeric)
returns void
language plpgsql
set search_path = ''
as $$
declare crit boolean; warn boolean; mc text; mw text;
begin
  case p_param
    when 'tidal_volume'  then crit := v < 350; warn := v < 380;
                              mc := 'Tidal Volume ต่ำกว่าเกณฑ์';  mw := 'Tidal Volume ค่อนข้างต่ำ';
    when 'resp_rate'     then crit := v > 28;  warn := v > 22;
                              mc := 'Resp Rate สูงผิดปกติ';       mw := 'Resp Rate สูงกว่าปกติ';
    when 'spo2'          then crit := v < 88;  warn := v < 92;
                              mc := 'SpO2 ต่ำมาก — ต้องดูด่วน';    mw := 'SpO2 ต่ำกว่าเกณฑ์';
    when 'peak_pressure' then crit := v > 35;  warn := v > 30;
                              mc := 'Peak Pressure สูงเกินไป';     mw := 'Peak Pressure สูงกว่าเกณฑ์';
    when 'leak'          then crit := v > 25;  warn := v > 15;
                              mc := 'Leak สูงมาก — ตรวจสอบวงจร';  mw := 'Leak สูงกว่าเกณฑ์';
  end case;

  if crit then
    perform sim.upsert_alert(p_patient, 'critical', p_param, 'vent', mc);
  elsif warn then
    perform sim.upsert_alert(p_patient, 'warning', p_param, 'vent', mw);
  else
    perform sim.auto_resolve(p_patient, p_param);
  end if;
end $$;

create or replace function sim.tick()
returns void
language plpgsql
set search_path = ''
as $$
declare
  cfg    sim.config%rowtype;
  p      record;
  s      sim.state%rowtype;
  lv     record;
  li     record;
  params text[] := array['tidal_volume','resp_rate','spo2','peak_pressure','leak'];
  k      numeric;
  d_tv numeric; d_rr numeric; d_sp numeric; d_pp numeric; d_lk numeric;
  tv numeric; rr numeric; sp numeric; fi numeric; pp numeric; lk numeric;
  rem numeric; rate numeric; st text;
begin
  -- ถ้ารอบก่อนยังไม่เสร็จ ข้ามรอบนี้ไปเลย ไม่ให้ซ้อนกัน
  if not pg_try_advisory_xact_lock(hashtext('multiwatch.sim.tick')) then
    return;
  end if;

  select * into cfg from sim.config limit 1;

  for p in select id, monitor_type::text as mt from public.patients loop
    insert into sim.state (patient_id) values (p.id) on conflict do nothing;
    select * into s from sim.state where patient_id = p.id for update;

    -- ----- ventilator -----
    if p.mt in ('vent', 'both') then
      d_tv := 0; d_rr := 0; d_sp := 0; d_pp := 0; d_lk := 0;

      if s.anomaly_param is null and s.cooldown <= 0 and random() < cfg.anomaly_chance then
        s.anomaly_param := params[1 + floor(random() * array_length(params, 1))::int];
        s.anomaly_scale := 0.7 + random() * 0.8;   -- บางครั้งแค่ warning บางครั้งถึง critical
        s.ticks_left    := cfg.anomaly_ticks;
      end if;

      if s.anomaly_param is not null then
        case s.anomaly_param
          when 'tidal_volume'  then d_tv := -14  * s.anomaly_scale;
          when 'resp_rate'     then d_rr :=  2.0 * s.anomaly_scale;
          when 'spo2'          then d_sp := -1.4 * s.anomaly_scale;
          when 'peak_pressure' then d_pp :=  2.2 * s.anomaly_scale;
          when 'leak'          then d_lk :=  2.8 * s.anomaly_scale;
        end case;
        s.ticks_left := s.ticks_left - 1;
        if s.ticks_left <= 0 then
          s.anomaly_param := null;
          s.cooldown      := cfg.cooldown_ticks;
        end if;
      else
        s.cooldown := s.cooldown - 1;
      end if;

      select * into lv from public.vitals_readings
       where patient_id = p.id order by recorded_at desc, id desc limit 1;

      tv := coalesce(lv.tidal_volume,  440 + (random() - 0.5) * 40);
      rr := coalesce(lv.resp_rate,     16  + (random() - 0.5) * 4);
      sp := coalesce(lv.spo2,          97  + (random() - 0.5) * 2);
      fi := coalesce(lv.fio2,          30  + (random() - 0.5) * 8);
      pp := coalesce(lv.peak_pressure, 20  + (random() - 0.5) * 6);
      lk := coalesce(lv.leak,          4   + random() * 4);

      k := cfg.reversion;
      tv := round(sim.clamp(sim.step(tv, 440, 8,   d_tv, k), 260, 480), 1);
      rr := round(sim.clamp(sim.step(rr, 16,  0.8, d_rr, k),   8,  42), 1);
      sp := round(sim.clamp(sim.step(sp, 97,  0.5, d_sp, k),  78, 100), 1);
      fi := round(sim.clamp(sim.step(fi, 30,  1,   0,    k),  21, 100), 1);
      pp := round(sim.clamp(sim.step(pp, 20,  0.8, d_pp, k),   8,  45), 1);
      lk := round(sim.clamp(sim.step(lk, 6,   0.8, d_lk, k),   0,  45), 1);

      insert into public.vitals_readings
        (patient_id, tidal_volume, resp_rate, spo2, fio2, peak_pressure, leak)
      values (p.id, tv, rr, sp, fi, pp, lk);

      perform sim.check_vent(p.id, 'tidal_volume',  tv);
      perform sim.check_vent(p.id, 'resp_rate',     rr);
      perform sim.check_vent(p.id, 'spo2',          sp);
      perform sim.check_vent(p.id, 'peak_pressure', pp);
      perform sim.check_vent(p.id, 'leak',          lk);
    end if;

    -- ----- IV pump -----
    if p.mt in ('iv', 'both') then
      select * into li from public.iv_readings
       where patient_id = p.id order by recorded_at desc, id desc limit 1;

      rem  := coalesce(li.remaining_pct, 60 + random() * 30);
      rate := coalesce(li.rate_ml_hr, 80);
      st   := coalesce(li.status, 'running');

      if st = 'running' then
        rem := sim.clamp(rem - rate * 0.01, 0, 100);
        if rem <= 0 then rem := 100; end if;   -- จำลองเปลี่ยนถุงใหม่
      end if;
      rem := round(rem, 1);

      insert into public.iv_readings (patient_id, remaining_pct, rate_ml_hr, status)
      values (p.id, rem, rate, st);

      if rem < 5 then
        perform sim.upsert_alert(p.id, 'critical', 'iv_remaining', 'iv',
                                 format('สารน้ำใกล้หมด (%s%%)', round(rem)));
      elsif rem < 20 then
        perform sim.upsert_alert(p.id, 'warning', 'iv_remaining', 'iv',
                                 format('สารน้ำเหลือน้อย (%s%%)', round(rem)));
      else
        perform sim.auto_resolve(p.id, 'iv_remaining');
      end if;
    end if;

    update sim.state
       set anomaly_param = s.anomaly_param,
           anomaly_scale = s.anomaly_scale,
           ticks_left    = s.ticks_left,
           cooldown      = s.cooldown
     where patient_id = p.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) ลบข้อมูลเก่า
-- ---------------------------------------------------------------------
create or replace function sim.cleanup()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- กราฟใช้แค่ 30 จุดล่าสุด (~2.5 นาที) เก็บไว้ 30 นาทีก็พอ
  delete from public.vitals_readings where recorded_at < now() - interval '30 minutes';
  delete from public.iv_readings     where recorded_at < now() - interval '30 minutes';
  -- alert ที่ปิดไปแล้วเกิน 3 วัน
  delete from public.alerts where resolved_at < now() - interval '3 days';
  -- log ของ pg_cron เอง (รันทุก 5 วิ = ~17,000 แถว/วัน)
  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''1 hour''';
  exception when others then null;
  end;
end $$;

revoke all on all functions in schema sim from public;

-- ---------------------------------------------------------------------
-- ตั้งเวลา (pg_cron) — ถ้ารันนอก Supabase ส่วนนี้จะถูกข้าม
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  -- ชื่อเดิม = อัปเดต job เดิม ไม่สร้างซ้ำ
  perform cron.schedule('multiwatch-sim-tick', '5 seconds',     'select sim.tick()');
  perform cron.schedule('multiwatch-cleanup',  '*/10 * * * *',  'select sim.cleanup()');
exception when others then
  raise notice 'ข้ามการตั้ง pg_cron: %', sqlerrm;
end $$;
