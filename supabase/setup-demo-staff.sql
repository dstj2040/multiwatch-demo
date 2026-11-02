-- =====================================================================
-- รันหลัง migration 20261102_demo_mode.sql (ใน Supabase → SQL Editor)
-- =====================================================================

-- A) ตรวจ trigger ที่อาจขวางการเขียนผ่าน service role
--    ถ้ามี trigger บนตาราง alerts ที่ใช้ auth.uid() ให้ส่งผลมาให้ดูก่อน
select event_object_table as "table", trigger_name, action_statement
from information_schema.triggers
where trigger_schema = 'public';

-- B) ผูกบัญชีพยาบาล demo
--    1. Authentication → Users → Add user → Create new user
--       (เช่น demo-nurse@multiwatch.local, รหัสผ่านสุ่มยาวๆ, ติ๊ก Auto Confirm)
--       หรือจะใช้บัญชีพยาบาลที่มีอยู่แล้วก็ได้
--    2. ก๊อป UUID ของ user นั้นมาแทน <DEMO_UUID> ด้านล่าง แล้วรัน
--    3. ใส่ UUID เดียวกันเป็น DEMO_STAFF_ID ใน Vercel
insert into public.staff_profiles (id, full_name, role, ward_id)
values ('<DEMO_UUID>', 'พยาบาล Demo', 'nurse', (select id from public.wards order by created_at limit 1))
on conflict (id) do update
  set full_name = excluded.full_name, role = 'nurse', ward_id = excluded.ward_id;

-- C) ตรวจว่า pg_cron ทำงาน (รอสัก 10 วินาทีหลังรัน migration)
select jobname, schedule, active from cron.job where jobname like 'multiwatch-%';
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'multiwatch-sim-tick')
order by start_time desc limit 5;

-- ---------------------------------------------------------------------
-- คำสั่งที่มีประโยชน์
-- ---------------------------------------------------------------------
-- หยุดตัวจำลองชั่วคราว / เปิดใหม่
--   select cron.alter_job((select jobid from cron.job where jobname = 'multiwatch-sim-tick'), active := false);
--   select cron.alter_job((select jobid from cron.job where jobname = 'multiwatch-sim-tick'), active := true);
-- ปรับความถี่เหตุผิดปกติ
--   update sim.config set anomaly_chance = 0.08;
