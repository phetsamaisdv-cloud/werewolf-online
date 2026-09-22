# 🐺 Werewolf Online v2.1

เกม Werewolf Online แบบ Social Deduction เล่นผ่านเว็บ (มือถือ/คอมพิวเตอร์)

- ผู้เล่น: 5–16 คน + Moderator (คนทรง) 1–2 คน
- เทคโนโลยี: HTML + CSS + JavaScript (vanilla, ES modules) + Firebase Realtime Database
- Deploy: Netlify (host static) / Firebase Hosting

## โครงสร้างโปรเจค

```
werewolf-online/
├── public/                  # Web root (ทุกหน้าเกม)
│   ├── index.html           # หน้าแรก (ใส่ชื่อ + สร้าง/เข้าห้อง)
│   ├── lobby.html           # ล็อบบี้
│   ├── host.html            # หน้าคนทรง
│   ├── player.html          # หน้าผู้เล่น (กลางคืน/กลางวัน/โหวต)
│   ├── end.html             # หน้าจบเกม
│   ├── settings.html        # ตั้งค่า
│   ├── help.html            # กติกา + บทบาท
│   ├── profile.html         # โปรไฟล์
│   └── src/                 # โค้ด JavaScript (logic แยกจาก UI)
├── assets/                  # ภาพ (roles / ui / bg)
├── firebase.json            # ตั้งค่า Firebase Hosting + Rules
├── firebase-rules.json      # Security Rules ของ Realtime Database
└── package.json
```

## ความต้องการ (Prerequisites)

- [Node.js](https://nodejs.org) LTS (ใช้สำหรับ Firebase CLI / Netlify CLI)
- [Firebase CLI](https://firebase.google.com/docs/cli) หรือ [Netlify CLI](https://docs.netlify.com/cli/)
- บัญชี [Firebase](https://firebase.google.com) (ฟรี)

## วิธีติดตั้ง

```bash
# 1) ติดตั้ง Firebase CLI
npm install -g firebase-tools

# 2) เข้าสู่ระบบ Firebase
firebase login

# 3) (ครั้งแรก) เชื่อมโปรเจค Firebase
firebase init
#   - เลือก "Realtime Database" + "Hosting"
#   - Public directory: public
#   - เลือก Cover rules file เป็น firebase-rules.json

# 4) ใส่ Firebase config จริงที่ public/src/firebase.js
#    (แก้ค่าทุกช่อง YOUR_... ให้เป็นค่าจาก Console)
```

## วิธีรัน (Local)

```bash
npm install
npm run serve        # เปิด firebase serve → http://localhost:5000
```

## วิธี Deploy เช้า Netlify

1. Push โค้ดขึ้น GitHub
2. netlify.com → **Add new site** → Import existing project
3. เลือก repo → **Publish directory:** `public`
4. กด Deploy เสร็จ
5. อย่าลืมเปิดโปรเจค Firebase (Realtime Database) เป็น **Public** สำหรับ dev จริง ๆ

## หมายเหตุเรื่อง Tenant

- Realtime Database ใช้แล้วจะคิดค่าใช้จ่ายเมื่อเกิน Spark Plan → ใช้เสร็จปิดโปรเจคได้ถ้าไม่เอาต่อ
- Security Rules อยู่ใน `firebase-rules.json` (ดูแผนข้อ 9) — สำคัญมาก อย่าเปิด write ทั้งหมด

---

📖 รายละเอียดกติกา/เงื่อนไขชนะฉบับเต็มดูได้ใน `แผนโปรเจค.md`