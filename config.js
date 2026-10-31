/*
 * ตั้งค่าหน้าเว็บ PAMS (GitHub Pages)
 * ----------------------------------------------------------------
 * ใส่เฉพาะลิงก์ Web App ของ Google Apps Script (ลงท้ายด้วย /exec)
 * ลิงก์นี้ไม่ใช่ความลับ — ระบบตรวจ OTP + Token + สิทธิ์ผู้ใช้ทุกคำขอที่ฝั่ง Apps Script
 *
 * ห้ามใส่: รหัสผ่าน · GEMINI_API_KEY · LINE Token · SPREADSHEET_ID · Folder ID หรือข้อมูลลับใด ๆ
 * (คีย์ลับเก็บใน Apps Script → การตั้งค่าโปรเจกต์ → พร็อพเพอร์ตี้ของสคริปต์ เท่านั้น)
 */
window.PAMS_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/ใส่รหัส-Deploy-ของคุณ/exec'
};
