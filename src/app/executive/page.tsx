import { redirect } from "next/navigation";

// หน้านี้เลิกใช้แล้ว (demo mode ไม่มีล็อกอิน) — ลบทั้งโฟลเดอร์ทิ้งได้เลย
export default function LegacyPage() {
  redirect("/");
}
