# PAMS — หน้าเว็บส่วนหน้า (GitHub Pages) v1.13.0

หน้าเว็บของระบบบริหารจัดการทรัพย์สิน เป็นไฟล์ static ล้วน · ข้อมูล ไฟล์ สิทธิ์ผู้ใช้ และคีย์ลับทั้งหมดอยู่ที่ Google Apps Script

- แก้ไฟล์เดียว: `config.js` → ใส่ลิงก์ Web App ที่ลงท้าย `/exec`
- **ห้ามใส่** รหัสผ่าน / API Key / Token / Spreadsheet ID / Folder ID ในไฟล์ใด ๆ ของ repo นี้ (repo เป็นสาธารณะ)
- เข้าสู่ระบบด้วย OTP ทางอีเมล · ทุกคำขอตรวจ Token + บทบาท + หมวด + สิทธิ์ ที่ฝั่ง Apps Script
- `assets/app.js` และ `assets/styles.css` สร้างจาก JavaScript.html / Styles.html — อัปเดตพร้อมโค้ด Apps Script รุ่นเดียวกันเสมอ

คู่มือติดตั้งฉบับเต็ม: README-v1.13-GitHub-Pages (มากับชุดไฟล์)
