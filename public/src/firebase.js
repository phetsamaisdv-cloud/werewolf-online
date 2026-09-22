// ============================================================
// firebase.js — ตั้งค่า Firebase (Realtime Database v9 modular SDK)
// โปรเจค: Werewolf Online v2.1
// ============================================================
import { initializeApp } from "firebase/app";
import { getDatabase, ref } from "firebase/database";

// Config จริงของโปรเจค "werewolf-online23"
// (จาก Firebase Console → Project settings → Your apps → Web app)
const firebaseConfig = {
  apiKey: "AIzaSyCAkC4zq9ntCkq370R2hsMlrxnUkE0546A", // คีย์สาธารณะใช้ในหน้าเว็บได้ (อย่าเผลอไปใส่ใน workaround แทน)
  authDomain: "werewolf-online23.firebaseapp.com",
  databaseURL: "https://werewolf-online23-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "werewolf-online23",
  storageBucket: "werewolf-online23.firebasestorage.app",
  messagingSenderId: "180903285789",
  appId: "1:180903285789:web:2350426ae24fe811ef62f4"
};

// initializeApp: เริ่มต้น Firebase App ครั้งเดียว แล้ว export ไปใช้ทั้งโปรเจค
export const app = initializeApp(firebaseConfig);

// getDatabase: ดึง instance ของ Realtime Database มาใช้
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