// ============================================================
// firebase.js — ตั้งค่า Firebase (Realtime Database v9 modular SDK)
// โปรเจค: Werewolf Online v2.1
// ============================================================
import { initializeApp } from "firebase/app";
import { getDatabase, ref } from "firebase/database";

// 🔧 TODO: แทนที่ค่าด้วย config ของโปรเจค Firebase จริงของคุณ
// วิธีหา: Firebase Console → ⚙️ Project settings → General → Your apps
//          → Web app (ว่าง ๆ ไม่ได้ config)? ให้กด `</>` เพิ่มแอปเว็บก่อน
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// initializeApp: เริ่มต้น Firebase App ครั้งเดียว แล้ว export ไปใช้ทั้งโปรเจค
export const app = initializeApp(firebaseConfig);

// getDatabase: ดึง instance ของ Realtime Database มาใช้ (ตรงนี้คือ realtime db)
export const db = getDatabase(app);

// ============================================================
// ฟังก์ชันอ้างอิงจุดข้อมูล (ref) ที่ใช้บ่อย
// ใช้ลดการเขียน ref ซ้ำซาก และรวม path ไว้ที่เดียว แก้ง่าย
// ============================================================
export function roomRef(code) {
  return ref(db, `rooms/${code}`);
}

export function playersRef(code) {
  return ref(db, `rooms/${code}/players`);
}

export function playerRef(code, uid) {
  return ref(db, `rooms/${code}/players/${uid}`);
}