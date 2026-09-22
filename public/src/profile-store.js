// ============================================================
// profile-store.js — สถิติผู้เล่นในเครื่อง (localStorage)
// อ้างอิงแผนข้อ 6 (Profile: ชื่อ + สถิติ) — เกมที่เล่น/เกมที่ชนะ
// ไว้ให้ end-ui.js ใช้ recordGame() เมื่อจบเกมในงานถัดไป
// ============================================================
const STORE_KEY = "werewolf_profile";

function emptyProfile() {
  return { name: "", played: 0, won: 0 };
}

// ------------------------------------------------------------
// loadProfile() — อ่านโปรไฟล์ (หรือคืนค่าเริ่มต้น)
// ------------------------------------------------------------
export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyProfile();
    return Object.assign(emptyProfile(), JSON.parse(raw));
  } catch (e) {
    console.warn("load profile fail:", e);
    return emptyProfile();
  }
}

// ------------------------------------------------------------
// saveProfile(profile) — เขียนโปรไฟล์ (เก็บเป็น JSON)
// ------------------------------------------------------------
export function saveProfile(profile) {
  localStorage.setItem(STORE_KEY, JSON.stringify(profile));
}

// ------------------------------------------------------------
// setName(name) — อัปเดตชื่อ เก็บไว้ในเครื่อง
// ------------------------------------------------------------
export function setName(name) {
  const p = loadProfile();
  p.name = name.trim();
  saveProfile(p);
  return p;
}

// ------------------------------------------------------------
// recordGame(won, nowName) — บันทึกผลจบเกม (เพิ่ม played / won)
//   won = true → นับชนะด้วย / ถ้ามีชื่อ (จาก end game) เซฟชื่อด้วย
// ------------------------------------------------------------
export function recordGame(won, nowName = null) {
  const p = loadProfile();
  p.played += 1;
  if (won) p.won += 1;
  if (nowName && nowName.trim()) p.name = nowName.trim();
  saveProfile(p);
  return p;
}

// ------------------------------------------------------------
// resetProfile() — ล้างสถิติทั้งหมด (ไม่ล้างชื่อ)
// ------------------------------------------------------------
export function resetProfile() {
  const p = loadProfile();
  p.played = 0;
  p.won = 0;
  saveProfile(p);
  return p;
}