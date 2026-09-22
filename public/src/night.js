// ============================================================
// night.js — ระบบกลางคืน (Night System)
// อ้างอิงแผนข้อ 3.1 (ลำดับกลางคืน), 3.2 (การสื่อสารหมาป่า),
// ข้อ 4 (กติกาเฉพาะบทบาท), ข้อ 8 (Data Schema: /night, /wolf, /cursed)
//
// ลำดับกลางคืนที่ recommends (ข้อ 3.1):
//   Cupid → Seer/Aura → Doctor/Bodyguard → Witch → Sorceress
//   → Wolf → Cursed (ถูกเรียกทุกคืน เพื่อคนทรงแจ้งสถานะปากเปล่า)
//
// ฟังก์ชันหลัก:
//   submitNightAction(state, uid, type, target) — ตรวจ + สร้าง action
//   resolveNight(roomState) — ประมวลผลทั้งคืน → ผลลัพธ์ (ตาย/ผลตรวจ/ฯลฯ)
// ============================================================
import { isWolfTeam } from "./roles.js";
import { canWolfSeeCursed, readCursedStatus, updateCursedStatus } from "./cursed.js";

// ------------------------------------------------------------
// ค่าคงที่: ประเภท action ที่ใช้ได้ในกลางคืน (ข้อ 4)
// ------------------------------------------------------------
export const ACTIONS = {
  SEER: "seer",                     // ผู้หยั่งรู้: ตรวจหมาป่าหรือไม่
  AURA: "aura",                     // ผู้หยั่งรู้ออร่า: รู้ role จริง
  DOCTOR: "doctor",                 // หมอ: ป้องกัน wolf kill (ห้ามตัวเอง)
  BODYGUARD: "bodyguard",           // บอดี้การ์ด: ป้องกัน wolf kill (กันตัวเองได้ ห้ามซ้ำคนเดิม)
  WITCH_HEAL: "witch_heal",         // แม่มด: ยากัน life (wolf kill)
  WITCH_POISON: "witch_poison",     // แม่มด: ยาพิษ ฆ่า 1 คน
  CUPID: "cupid",                   // คิวปิด: คืนแรกเลือกคู่รัก 2 คน
  SORCERESS: "sorceress",           // แม่มดหมาป่า: ตรวจหา Seer ใช่/ไม่ใช่
  WOLF: "wolf"                      // หมาป่า: โหวตเหยื่อ (พิเศษ เก็บที่ /wolf/votes)
};

// บทบาทที่โหวตฆ่าได้ (ข้อ 3.2 + 4): Werewolf, Wolf Cub, Sorceress
// (Minion "ไม่ร่วมฆ่า", Cursed เพิ่ง turn คืนนั้นยังไม่ได้ร่วม — ข้อ 4)
export const WOLF_VOTER_ROLES = ["werewolf", "wolfCub", "sorceress"];

// บทบาทที่ถูกเรียกกลางคืนเรียงลำดับ (ข้อ 3.1) — ใช้แสดงขั้นตอนคนทรง
export const NIGHT_ORDER = [
  ACTIONS.CUPID,
  ACTIONS.SEER,
  ACTIONS.AURA,
  ACTIONS.DOCTOR,
  ACTIONS.BODYGUARD,
  ACTIONS.WITCH_HEAL,
  ACTIONS.SORCERESS,
  ACTIONS.WOLF,
  ACTIONS.CURSED
];

// เซตของ action ที่เป็น "การรักษา/กัน wolf kill"
const HEAL_TYPES = [ACTIONS.DOCTOR, ACTIONS.BODYGUARD, ACTIONS.WITCH_HEAL];

// ------------------------------------------------------------
// findPlayer(players, uid) — หาผู้เล่น
// ------------------------------------------------------------
function findPlayer(players, uid) {
  return players.find((p) => p.uid === uid) || null;
}

// ------------------------------------------------------------
// submitNightAction(state, uid, type, target)
// สร้าง action กลางคืนแบบ validated (ยังไม่เขียน DB — caller เป็นคนเขียน)
// state: { players, currentNight, prevBodyguardTarget, cursedStatuses }
//
// ตรวจสอบตามกติกาข้อ 4:
//   doctor  : ห้ามป้องกันตัวเอง
//   bodyguard : ห้ามซ้ำคนเดิมจากคืนก่อน (แต่ป้องกันตัวเองได้)
//   witch   : ห้ามใช้ยาทั้ง 2 พร้อมกัน (เช็กจาก actions ที่ส่งมาแล้ว)
//   cupid   : คืนแรกเท่านั้น + ต้องเลือก 2 คน (target = [a, b])
//   สุดท้าย  : เป้าเลือกได้เฉพาะคนที่ยังมีชีวิต
//
// คืนค่า: { ok:true, action } หรือ { ok:false, reason }
// ============================================================
export function submitNightAction(state, uid, type, target) {
  const { players, currentNight, prevBodyguardTarget } = state;

  const me = findPlayer(players, uid);
  if (!me || me.alive !== true) {
    return { ok: false, reason: "คุณไม่ใช่ผู้เล่นที่มีชีวิต" };
  }

  // เช็กประเภท action ที่ยอมรับ
  const allowed = Object.values(ACTIONS);
  if (!allowed.includes(type)) {
    return { ok: false, reason: `action ไม่รู้จัก: ${type}` };
  }

  // เป้า (ยกเว้น cupid ที่เป็น array คู่รัก)
  const targets = Array.isArray(target) ? target : [target];
  for (const t of targets) {
    if (!t) return { ok: false, reason: "ยังไม่ได้เลือกเป้าหมาย" };
  }

  // ---- กติกาเฉพาะบทบาท (ข้อ 4) ----
  if (type === ACTIONS.DOCTOR) {
    if (target === uid) return { ok: false, reason: "หมอห้ามป้องกันตัวเอง" };
  }

  if (type === ACTIONS.BODYGUARD) {
    if (prevBodyguardTarget && target === prevBodyguardTarget) {
      return { ok: false, reason: "บอดี้การ์ดห้ามป้องกันคนเดิมจากคืนก่อน" };
    }
    // กันตัวเองได้ → ผ่าน
  }

  if (type === ACTIONS.WITCH_HEAL || type === ACTIONS.WITCH_POISON) {
    // "ห้ามใช้พร้อมกัน" — ถ้ามีอีก action หนึ่งถูกส่งมาแล้ว → ปฏิเสธ
    const witchActions = (state.pendingActions || []).filter(
      (a) => (a.type === ACTIONS.WITCH_HEAL || a.type === ACTIONS.WITCH_POISON) && a.uid === uid
    );
    if (witchActions.length > 0) {
      return { ok: false, reason: "แม่มดห้ามใช้ยา 2 อย่างพร้อมกันในคืนเดียว" };
    }
  }

  if (type === ACTIONS.CUPID) {
    if (currentNight !== 1) return { ok: false, reason: "คิวปิดเลือกคู่รักได้แค่คืนแรก" };
    if (targets.length !== 2 || targets[0] === targets[1]) {
      return { ok: false, reason: "คิวปิดต้องเลือกคน 2 คนที่ไม่ซ้ำกัน" };
    }
  }

  // เป้าต้องยังมีชีวิต (ยกเว้น cupid ที่เป็นคู่)
  for (const t of targets) {
    const p = findPlayer(players, t);
    if (!p || p.alive !== true) {
      return { ok: false, reason: "เป้าหมายนี้ไม่อยู่ในเกมแล้ว" };
    }
  }

  return { ok: true, action: { uid, type, target, used: true } };
}

// ------------------------------------------------------------
// pickWolfVictims(wolfVotes, k)
// เลือกเหยื่อจากโหวตของหมาป่า (ข้อ 3.2: เสียงข้างมากชนะ)
//   k = 1 ปกติ / k = 2 ตอน Wolf Cub ตายก่อนหน้า (ข้อ 4 -> ฆ่า 2 คน คนละคน)
// เสมอในตำแหน่งที่ต้องตัดสิน → ไม่เลือกคนนั้น (เทียบหลักตัว件 3.3)
// คืนค่า: array ขอ uid เหยื่อ (เรียงตามเสียงมาก)
// ------------------------------------------------------------
export function pickWolfVictims(wolfVotes, k = 1) {
  if (!wolfVotes) return [];

  const tally = {};
  for (const target of Object.values(wolfVotes)) {
    if (!target) continue;
    tally[target] = (tally[target] || 0) + 1;
  }

  // เรียงเสียงมาก → น้อย
  const entries = Object.entries(tally)
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count);

  const picked = [];
  let i = 0;
  while (picked.length < k && i < entries.length) {
    const slots = k - picked.length;
    // ระดับคะแนนเดียวกับ entries[i] ที่ยังไม่ถูกเลือก (tie group)
    const level = entries.filter(
      (e) => e.count === entries[i].count && !picked.includes(e.target)
    );
    if (level.length === 0) break;
    // k=1 และมีคะแนนเท่ากันหลายตัว → เสมอ → ไม่มีใครตาย (ข้อ 3.3)
    if (slots === 1 && level.length > 1) break;
    // เติมเหยื่อจากกลุ่มนี้ให้ครบช่อง (คืน cub double-kill เลือกได้ 2 คน)
    for (const e of level) {
      if (picked.length >= k) break;
      picked.push(e.target);
    }
    i += level.length;
  }
  return picked;
}

// ------------------------------------------------------------
// findActionBy(actions, type, uid)
// หา action ชนิดใดชนิดหนึ่งของผู้เล่น (คืน action หรือ null)
// ------------------------------------------------------------
function findActionBy(actions, type, uid) {
  const a = actions && actions[uid];
  return a && a.type === type ? a : null;
}

// ============================================================
// resolveNight(roomState) — ประมวลผลทั้งคืน (หัวใจของ night system)
//
// roomState: {
//   players,              // array { uid, role, alive }
//   currentNight,         // number (วัน/คืนที่เท่าไหร่)
//   actions,              // { uid: { type, target, used } } จาก /night/actions
//   wolfVotes,            // { wolfUid: targetUid } จาก /wolf/votes
//   lovers,               // [uidA, uidB] | null
//   cursedStatuses,       // { uid: {status, turnedNight} | string }
//   prevBodyguardTarget,  // เป้าบอดี้การ์ดเมื่อคืนก่อน
//   wolfDoubleKill,       // flag: Wolf Cub ตายเมื่อคืนก่อน → ฆ่า 2 คน
// }
//
// ลำดับประมวลผลเลียนแบบข้อ 3.1: ผลตรวจก่อน → กัน wolf kill → พิษแม่มด
// → หมาป่าเลือกเหยื่อ → Cursed ถูกกัด (ทันที) → Lovers ตายตาม → เช็ก Hunter
//
// คืนค่า: {
//   players, deaths, killedByWolf, wolfSickNext,
//   lovers, cursedStatuses, results, hunterTriggers,
//   wolf: { doubleKill, knowsCursed }, warnings
// }
// ============================================================
export function resolveNight(roomState) {
  const {
    players,
    currentNight,
    actions = {},
    wolfVotes = {},
    lovers = null,
    cursedStatuses = {},
    prevBodyguardTarget = null,
    wolfDoubleKill = false,
    wolfSickPrev = false
  } = roomState;

  // สำเนาผู้เล่น (ไม่แก้ input)
  const next = players.map((p) => ({ ...p }));
  const deaths = [];
  const killedByWolf = [];
  const warnings = [];
  const deathCause = {}; // uid -> "wolf" | "poison" | "lover"
  let wolfSickNext = false; // หมาป่าป่วยจาก Diseased

  const curse = {}; // เหมือนเดิม + อัปเดตคืนนี้
  for (const k of Object.keys(cursedStatuses)) curse[k] = readCursedStatus(cursedStatuses[k]);

  // ============ 1) ผลตรวจก่อน (Seer/Aura/Sorceress) ============
  // ใช้ข้อมูลก่อนถูกกัด เพื่อสะท้อน "ตรวจก่อน Wolf/Cursed" (ข้อ 3.1)
  const results = { seer: null, aura: null, sorceress: null };
  for (const p of next) {
    if (p.alive !== true) continue;
    const a = actions[p.uid];
    if (!a || !a.used) continue;

    if (a.type === ACTIONS.SEER) {
      const t = findPlayer(next, a.target);
      results.seer = {
        target: a.target,
        isWolf: t ? isWolfTeam(t.role, curse[a.target] && curse[a.target].status) : null
      };
    }
    if (a.type === ACTIONS.AURA) {
      const t = findPlayer(next, a.target);
      results.aura = { target: a.target, role: t ? t.role : null };
    }
    if (a.type === ACTIONS.SORCERESS) {
      const t = findPlayer(next, a.target);
      results.sorceress = { target: a.target, isSeer: t ? t.role === "seer" : null };
    }
  }

  // ============ 1.5) คิวปิด: คืนแรกเลือกคู่รัก 2 คน (ข้อ 4) ============
  // เก็บคู่รักใหม่ถ้า cupid ลง action คืนนี้ (จาก target = [a, b])
  let loversFinal = lovers;
  for (const p of next) {
    if (p.alive !== true) continue;
    const a = actions[p.uid];
    if (!a || !a.used) continue;
    if (a.type === ACTIONS.CUPID && Array.isArray(a.target) && a.target.length === 2) {
      const [x, y] = a.target;
      if (findPlayer(next, x) && findPlayer(next, y)) loversFinal = [x, y];
    }
  }

  // ============ 2) หมาป่าเลือกเหยื่อ (ข้อ 3.2) ============
  const k = wolfDoubleKill ? 2 : 1; // Wolf Cub ตายคืนก่อน → 2 คน (ข้อ 4)
  const targetPool = pickWolfVictims(wolfVotes, k);

  // ============ 3) การกัน wolf kill (Doctor/Bodyguard/Witch heal) ============
  const protectedSet = new Set();
  let bgTarget = prevBodyguardTarget;
  for (const p of next) {
    if (p.alive !== true) continue;
    const a = actions[p.uid];
    if (!a || !a.used) continue;

    if (a.type === ACTIONS.DOCTOR || a.type === ACTIONS.BODYGUARD || a.type === ACTIONS.WITCH_HEAL) {
      protectedSet.add(a.target);
      if (p.role === "bodyguard") bgTarget = a.target; // จำเป้าคืนนี้ไว้
    }
  }

  // ============ 4) แม่มด: ห้ามใช้ 2 อย่างพร้อมกัน (ข้อ 4) ============
  let witchHealAction = null;
  let witchPoisonAction = null;
  for (const p of next) {
    if (p.alive !== true) continue;
    const a = actions[p.uid];
    if (!a || !a.used) continue;
    if (a.type === ACTIONS.WITCH_HEAL) witchHealAction = a;
    if (a.type === ACTIONS.WITCH_POISON) witchPoisonAction = a;
  }
  if (witchHealAction && witchPoisonAction) {
    // ใช้พร้อมกัน → ทั้ง 2 ถูกขัดขวาง (ห้ามตามข้อ 4)
    witchHealAction = null;
    witchPoisonAction = null;
    warnings.push("แม่มดใช้ยาพร้อมกันทั้ง 2 อย่าง → ทั้งคู่ไม่เกิดผล (กติกาข้อ 4)");
  }

  // ============ 5) ใช้ยาพิษ (ฆ่าตรง, ผ่านทุกการกัน) ============
  if (witchPoisonAction) {
    const t = findPlayer(next, witchPoisonAction.target);
    if (t && t.alive) {
      t.alive = false;
      deaths.push(t.uid);
      deathCause[t.uid] = "poison";
    }
  }

  // ============ 6) หมาป่าโจมตี (หลังกันแล้ว) ============
  if (wolfSickPrev) {
    // Diseased ถูกฆ่าก่อนหน้า (ข้อ 4) → หมาป่าป่วยคืนนี้ ฆ่าไม่ได้
    warnings.push("หมาป่าป่วยจากคืนก่อน (Diseased) → คืนนี้ไม่โจมตี");
  } else {
  for (const v of targetPool) {
    // protected → รอด (โดยเฉพาะกับ Wolf kill)
    if (protectedSet.has(v)) continue;
    const p = findPlayer(next, v);
    if (!p || !p.alive) continue;

    // Cursed ถูกกัดคืนนี้ (ไม่ตาย กลายเป็นหมาป่า) — ข้อ 4
    if (p.role === "cursed" && (!curse[v] || curse[v].status !== "turned")) {
      curse[v] = updateCursedStatus(v, true, currentNight);
      warnings.push(`Cursed (${v}) ถูกหมาป่ากัด → กลายเป็นหมาป่าคืนนี้ (คนทรงแจ้งปากเปล่า)`);
      continue;
    }

    // ตายจากหมาป่า
    p.alive = false;
    deaths.push(v);
    killedByWolf.push(v);
    deathCause[v] = "wolf";

    // Diseased: หมาป่าป่วย → ฆ่าใครไม่ได้คืนถัดไป (ข้อ 4)
    if (p.role === "diseased") {
      wolfSickNext = true;
      warnings.push("Diseased ถูกหมาป่าฆ่า → หมาป่าป่วย คืนถัดไปฆ่าไม่ได้");
    }
  }
  }

  // ============ 7) Wolf Cub ตายคืนนี้ → คืนถัดไปหมาป่าฆ่า 2 คน (ข้อ 4) ============
  // ดูจาก role เดิม (ก่อนตาย) ว่าตายด้วยสาเหตุโดนฆ่า (ทุกวิธี)
  let cubDied = false;
  for (const uid of deaths) {
    const orig = players.find((p) => p.uid === uid);
    if (orig && orig.role === "wolfCub") cubDied = true;
  }

  // ============ 9) Lovers ตายตาม (ข้อ 4 / 5.3) ============
  if (loversFinal && loversFinal.length === 2) {
    const pair = [...loversFinal];
    for (const uid of deaths) {
      if (!pair.includes(uid)) continue;
      const partner = pair.find((x) => x !== uid);
      const pw = findPlayer(next, partner);
      if (pw && pw.alive) {
        pw.alive = false;
        deaths.push(partner);
        deathCause[partner] = "lover";
      }
    }
  }

  // ============ 10) เช็ก Hunter ตายกลางคืน → ยิงเช้า (ข้อ 3.4) ============
  const hunterTriggers = [];
  for (const uid of deaths) {
    const orig = players.find((p) => p.uid === uid);
    if (orig && orig.role === "hunter") {
      // ตายเพราะคู่รัก (lover) หรือกลางคืน (wolf/poison)
      const phase = deathCause[uid] === "lover" ? "lovers_night" : "night";
      hunterTriggers.push({ uid, phase });
    }
  }

  // ============ 11) เปิดเผยบทบาทคนตาย (ตัวแทนการตายในเกม) ============
  // ตามข้อ 3.4: เปิดเผยบทบาทเมื่อตาย (default) — Hunter case เปิดเช้าถัดไป
  for (const uid of deaths) {
    const p = findPlayer(next, uid);
    if (p) p.revealed = true;
  }

  // ============ 12) หมาป่าฝั่งระบบเห็น Cursed เมื่อคืนถัดไป ============
  let knowsCursed = false;
  for (const cu of Object.values(curse)) {
    if (cu && cu.status === "turned" && canWolfSeeCursed(cu.turnedNight, currentNight)) {
      knowsCursed = true;
    }
  }

  return {
    players: next,
    deaths,                       // ผู้ตายคืนนี้ (ไม่รวม Cursed ที่แค่ถูกกัด)
    killedByWolf,                 // ผู้ตายเพราะหมาป่า (ไม่มีที่ถูกกัน)
    wolfSickNext,                 // true = หมาป่าป่วย คืนถัดไปฆ่าไม่ได้ (ข้อ 4)
    lovers: loversFinal,          // คู่รัก (cupid กดเลือกคืนแรก)
    cursedStatuses: curse,
    results,
    hunterTriggers,
    nextBodyguardTarget: bgTarget, // จำเป้าบอดี้การ์ดคืนนี้ → ห้ามซ้ำคืนถัดไป (ข้อ 4)
    wolf: { doubleKill: cubDied, knowsCursed, sickNext: wolfSickNext },
    warnings
  };
}