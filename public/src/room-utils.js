// ============================================================
// room-utils.js — ยูทิลิตี้ห้อง (สร้างรหัสห้อง + แจกบทบาท) — pure
// อ้างอิงแผนข้อ 7.1 (Room Code 4 หลัก), ข้อ 2/4/8 (แจกบทบาทจาก settings)
// ============================================================
import { getTeam } from "./roles.js";

// ตัวอักษรที่ใช้ (กัน I/O/0/1 ที่งงระหว่างกัน — แผนข้อ 7.1)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ------------------------------------------------------------
// genRoomCode(len=4) — สุ่มรหัสห้อง 4 หลัก (ตรวจซ้ำที่ caller)
// ------------------------------------------------------------
export function genRoomCode(len = 4) {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// ------------------------------------------------------------
// shuffle(arr) — Fisher-Yates (คืน array ใหม่ ไม่แก้ input)
// ------------------------------------------------------------
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------
// buildRoleDeck(playerCount, settings)
// สร้างสำรับบทบาทให้ตรงจำนวนผู้เล่น ตาม settings:
//   - หมาป่า = wolfCount ตัว (จากบทบาททีมหมาป่าที่เปิด)
//   - บทบาทพิเศษ (ทีมชาวบ้าน+กลาง ที่เปิด) เลือกอย่างละ 1 (Mason = 2)
//   - ที่เหลือ = ชาวบ้าน
// ถ้าบทบาทพิเศษเกินจำนวนผู้เล่น → ตัดบทบาทความสำคัญน้อยออกอัตโนมัติ
//   (เตือนใน `warned` — หมาป่าต้องครบเสมอ)
// คืนค่า: { ok, deck: [roleId], warned }
// ------------------------------------------------------------
export function buildRoleDeck(playerCount, settings) {
  const roles = settings.enabledRoles || {};
  const wolfCount = Math.min(settings.wolfCount || 0, playerCount);

  // หมาป่า: เลือกจากทีมหมาป่าที่เปิด (werewolf ถูกบังคับเปิดใน settings UI)
  const wolfPool = ["werewolf", "sorceress", "wolfCub", "minion"].filter(
    (id) => roles[id] === true
  );
  if (wolfPool.length === 0) wolfPool.push("werewolf");

  const wolves = [];
  for (let i = 0; i < wolfCount; i++) wolves.push(wolfPool[i % wolfPool.length]);

  // บทบาทพิเศษ เรียงตามความสำคัญ (สำรอง: ตัวที่เหลือเป็นคนทุกคนเห็น)
  const specialPriority = [
    "seer", "doctor", "witch", "hunter", "bodyguard", "cupid",
    "cursed", "auraSeer", "mason", "mayor", "diseased", "fool", "insomniac"
  ];
  const specials = specialPriority.filter(
    (id) => id !== "villager" && roles[id] === true
  );
  // Mason จอง 2 ช่อง (ข้อ 4) — ตัวอื่น 1 ช่อง
  const countSpecialFor = (id) => (id === "mason" ? 2 : 1);

  // ใส่บทบาทพิเศษตามความสำคัญจนกว่าจะเต็มจำนวนผู้เล่น (หมาป่าจองก่อน)
  const included = [];
  let slotsUsed = wolves.length;
  for (const id of specials) {
    const need = countSpecialFor(id);
    if (slotsUsed + need > playerCount) break;
    included.push(id);
    slotsUsed += need;
  }

  const dropped = specials.filter((id) => !included.includes(id));

  // ประกอบสำรับ
  let deck = [...wolves];
  for (const id of included) {
    for (let n = 0; n < countSpecialFor(id); n++) deck.push(id);
  }
  while (deck.length < playerCount) deck.push("villager");

  const warned = dropped.length
    ? `ใส่บทบาทพิเศษไม่พอ (${dropped.map((r) => r).join(", ")}) → ตัดออก ให้ชาวบ้านแทน`
    : null;

  return { ok: true, deck: shuffle(deck), warned };
}

// ------------------------------------------------------------
// normalizePlayers(keyedMap) — /players/{uid} เก็บ key เป็น identity (ไม่มี uid ใน value)
//   แปลงเป็น array [{ uid, ...playerData }] ให้ core ของเกม (p.uid) ใช้ได้ทุกจุด
// ------------------------------------------------------------
export function normalizePlayers(keyedMap) {
  return Object.entries(keyedMap || {}).map(([uid, p]) => ({ ...p, uid }));
}

// ------------------------------------------------------------
// assignRolesToPlayers(players, deck)
// ผูกบทบาทให้กับผู้เล่นตามลำดับ (เรียง joinedAt) — ตัด deck ตามจำนวน
// คืนค่า: { [uid]: { role, team } }
// ------------------------------------------------------------
export function assignRolesToPlayers(players, deck) {
  const out = {};
  players.forEach((p, i) => {
    const role = deck[i];
    out[p.uid] = { role, team: getTeam(role) };
  });
  return out;
}