# MultiWatch (demo)

แดชบอร์ดเฝ้าระวังเครื่องช่วยหายใจ + IV pump แบบ realtime — Next.js 16 + Supabase

## โหมด demo ทำงานยังไง

- **ไม่มีล็อกอิน** เปิดมาเห็นแดชบอร์ดทุกเตียงทันที (สมมติวอร์ดเดียว)
- **เบราว์เซอร์อ่านได้อย่างเดียว** — RLS เปิดแค่ `SELECT` ให้ anon
- **ปุ่ม acknowledge / resolve / escalate** ยิงไป `POST /api/alerts` ซึ่งเขียน DB ด้วย service role
  ในนาม "พยาบาล demo" (`DEMO_STAFF_ID`) มีตรวจ origin, validate input และ rate limit
- **ข้อมูลกราฟ** สร้างโดย `sim.tick()` ใน Postgres รันด้วย **pg_cron ทุก 5 วินาที**
  และ `sim.cleanup()` ทุก 10 นาที ลบข้อมูลเก่ากันฐานข้อมูลเต็ม
  (schema `sim` ไม่ได้เปิดผ่าน API — เรียกจากภายนอกไม่ได้)
- Role เหลือ `nurse` อย่างเดียว (บังคับด้วย constraint ใน DB)

`scripts/simulate-writer.mjs` เลิกใช้แล้ว — อย่ารันพร้อม pg_cron ไม่งั้นข้อมูลจะซ้อนกัน

## ติดตั้ง (ครั้งแรก)

1. Supabase → SQL Editor → รัน `supabase/migrations/20261102_demo_mode.sql`
2. ทำตาม `supabase/setup-demo-staff.sql` (สร้างบัญชีพยาบาล demo + ตรวจ cron)
3. Supabase → Authentication → Sign In / Providers → **ปิด Allow new users to sign up**
4. Vercel → Settings → Environment Variables (ดู `.env.example`)
   - `SUPABASE_SERVICE_ROLE_KEY` — **ห้าม** ขึ้นต้นด้วย `NEXT_PUBLIC_`
   - `DEMO_STAFF_ID`
5. Redeploy

## พัฒนาในเครื่อง

```bash
cp .env.example .env.local   # เติมค่า
npm install
npm run dev
```

threshold ของสัญญาณชีพอยู่ 2 ที่ ต้องแก้ให้ตรงกัน: `src/lib/status.ts` และ `sim.check_vent()` ใน migration
