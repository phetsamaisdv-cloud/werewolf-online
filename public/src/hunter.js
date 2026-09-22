// ============================================================
// hunter.js — ระบบนายพราน (Hunter)
// อ้างอิงแผนข้อ 3.4 (การตาย) + ข้อ 4 (กติกาเฉพาะบทบาท)
//   Hunter ตายกลางคืน (หมาป่า/Witch/Lovers) → เปิดบทบาทเช้าถัดไป + ยิง 1 คน
//   Hunter ตายกลางวัน (โหวต/Lovers)        → เปิดบทบาท + ยิงทันที
// ============================================================
import { checkWin } from "./win-check.js";
import { getLoverOf } from "./vote.js";

// ประเภทการตายของ Hunter (ตามพารามิเตอร์ฟังก์ชัน hunterDie)
export const HUNTER_DEATH_TYPE = {
  NIGHT: "night",           // ตายกลางคืน (หมาป่า / Witch)
  DAY: "day",               // ตายกลางวัน (ถูกโหวต)
  LOVERS_NIGHT: "lovers_night", // ตายกลางคืนเพราะคู่รัก
  LOVERS_DAY: "lovers_day"     // ตายกลางวันเพราะคู่รัก
};

// ------------------------------------------------------------
// hunterDie(uid, phase)
// เปิดบทบาท + ตั้งสถานะนายพรานเมื่อรู้ว่าตาย
// phase: "night" | "day" | "lovers_night" | "lovers_day"
//   night / lovers_night  → ยิงตอนเช้า (shootNow = false)
//   day / lovers_day      → ยิงทันที    (shootNow = true)
// คืนค่า: state ของ hunter เก็บไว้ในโหนด /hunter/
//   { uid, deathType, revealed, canShoot, shootNow, shot, target }
// ------------------------------------------------------------
export function hunterDie(uid, phase) {
  // ยิงทันทีเฉพาะตอนตายกลางวัน กลางคืนต้องรอเช้าถัดไป (ข้อ 3.4)
  const shootNow = phase === HUNTER_DEATH_TYPE.DAY || phase === HUNTER_DEATH_TYPE.LOVERS_DAY;

  return {
    uid,
    deathType: phase,      // ประเภทการตาย (night/day/lovers_night/lovers_day)
    revealed: true,        // เปิดบทบาทนายพราน
    canShoot: true,        // ยังยิงได้
    shootNow,              // true = ยิงทันที / false = ยิงตอนเช้า
    shot: false,           // ยังไม่ยิง
    target: null           // เป้าหมายยังไม่ได้เลือก
  };
}

// ------------------------------------------------------------
// validateHunterShot(players, hunterState, target)
// ตรวจว่าการยิงนี้ถูกต้องไหม:
//   - มีสถานะ hunter + ยังยิงได้ + ยังไม่เคยยิง
//   - มีเป้า + เป้ายังมีชีวิตอยู่
// คืนค่า: { ok, reason }
// ------------------------------------------------------------
export function validateHunterShot(players, hunterState, target) {
  if (!hunterState) {
    return { ok: false, reason: "ไม่พบสถานะนายพราน (ยังไม่เปิดบทบาท)" };
  }
  if (!hunterState.canShoot || hunterState.shot) {
    return { ok: false, reason: "นายพรานคนนี้ยิงไม่ได้แล้ว" };
  }
  if (!target) {
    return { ok: false, reason: "ยังไม่ได้เลือกเป้าหมาย" };
  }
  const p = players.find((x) => x.uid === target);
  if (!p || p.alive !== true) {
    return { ok: false, reason: "เป้าหมายนี้ไม่อยู่ในเกมแล้ว" };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// applyHunterShot({ players, lovers, cursedStatuses, hunterState, target })
// ยิงจริง + ลงสถานะ + เช็กชนะ
//   1. เป้า → alive=false, revealed=true
//   2. Lovers ตายตามถ้าเป้าเป็นคู่รัก
//   3. เช็กชนะ (ข้อ 5.3 หลัง Hunter ยิง)
// คืนค่า: { ok, players(ชุดใหม่), deaths[], winner, hunterFinal }
// ------------------------------------------------------------
export function applyHunterShot({ players, lovers, cursedStatuses, hunterState, target }) {
  // ตรวจเงื่อนไขก่อนยิง
  const valid = validateHunterShot(players, hunterState, target);
  if (!valid.ok) {
    return { ok: false, reason: valid.reason, players, deaths: [], winner: null, hunterFinal: hunterState };
  }

  // สำเนาผู้เล่นชุดใหม่
  const next = players.map((p) => ({ ...p }));
  const deaths = [];

  // เป้าหมายโดนยิง
  const hit = next.find((p) => p.uid === target);
  if (hit && hit.alive) {
    hit.alive = false;
    hit.revealed = true;
    deaths.push(hit.uid);
  }

  // Lovers ตายตาม (คนรักของเป้าโดนยิง)
  const loverUid = getLoverOf(lovers, target);
  const lover = loverUid ? next.find((p) => p.uid === loverUid) : null;
  if (lover && lover.alive && lover.uid !== hunterState.uid) {
    lover.alive = false;
    lover.revealed = true;
    deaths.push(lover.uid);
  }

  // เช็กชนะหลัง Hunter ยิง (ข้อ 5.3)
  const winner = checkWin(next, lovers, cursedStatuses, null);

  // อัปเดตสถานะ hunter → ยิงเสร็จแล้ว
  const hunterFinal = { ...hunterState, shot: true, target };

  return { ok: true, players: next, deaths, winner, hunterFinal };
}