// ============================================================
// host-control.js — เครื่องมือของคนทรง (Moderator/Host)
// อ้างอิงแผนข้อ 3.1 (ลำดับกลางคืน), 3.6 (คนทรงหลุด/transfer),
// 4 (Cursed reveal), 8 (Data Schema)
//
// ฟังก์ชันทั้งหมดเป็น pure (คืน object ที่จะนำไปเขียน Firebase)
// → UI / caller เป็นคน handle การเขียนจริง แยก logic ออกจาก UI
// ============================================================
import { ACTIONS, NIGHT_ORDER } from "./night.js";
import { canWolfSeeCursed, updateCursedStatus } from "./cursed.js";

// ------------------------------------------------------------
// getNightOrder(players) — ขั้นตอนการเรียกบทบาทกลางคืน (ข้อ 3.1)
// คืน array: [{ step, type, labelTH, uids(ผู้ที่ถูกเรียก) }]
// ผู้ที่ถูกเรียก = บทบาทนั้นที่ยังมีชีวิต (Cursed ถูกเรียกทุกคืน ข้อ 3.1)
// ------------------------------------------------------------
export function getNightOrder(players) {
  const alive = players.filter((p) => p.alive === true);

  // แผนที่ label ไทยสำหรับการเรียกแต่ละบทบาท
  const label = {
    [ACTIONS.CUPID]: "คิวปิด — เลือกคู่รัก (คืนแรก)",
    [ACTIONS.SEER]: "ผู้หยั่งรู้ — ตรวจหมาป่า 1 คน",
    [ACTIONS.AURA]: "ผู้หยั่งรู้ออร่า — รู้ role จริง",
    [ACTIONS.DOCTOR]: "หมอ — เลือกเป้าป้องกัน (ห้ามตัวเอง)",
    [ACTIONS.BODYGUARD]: "บอดี้การ์ด — เลือกเป้าป้องกัน",
    [ACTIONS.WITCH_HEAL]: "แม่มด — เลือกใช้ยารักษ/พิษ",
    [ACTIONS.SORCERESS]: "แม่มดหมาป่า — ตรวจหา Seer",
    [ACTIONS.WOLF]: "หมาป่า — โหวตเหยื่อร่วมกัน",
    [ACTIONS.CURSED]: "ผู้ต้องสาป — หลับ/ลืมตาตามคำสั่ง"
  };

  const roleForType = {
    [ACTIONS.CUPID]: "cupid",
    [ACTIONS.SEER]: "seer",
    [ACTIONS.AURA]: "auraSeer",
    [ACTIONS.DOCTOR]: "doctor",
    [ACTIONS.BODYGUARD]: "bodyguard",
    [ACTIONS.WITCH_HEAL]: "witch",
    [ACTIONS.SORCERESS]: "sorceress",
    [ACTIONS.WOLF]: "werewolf",
    [ACTIONS.CURSED]: "cursed"
  };

  return NIGHT_ORDER.map((type) => {
    const role = roleForType[type];
    let uids = [];
    if (type === ACTIONS.WOLF) {
      // หมาป่าที่ร่วมโหวต (ผ่าน night.js WOLF_VOTER_ROLES ประมวลผลไม่อยู่ → นับ alive ทั้งสาม role)
      uids = alive.filter((p) => ["werewolf", "wolfCub", "sorceress"].includes(p.role)).map((p) => p.uid);
    } else {
      uids = alive.filter((p) => p.role === role).map((p) => p.uid);
    }
    return { step: type, type, labelTH: label[type], uids };
  });
}

// ------------------------------------------------------------
// getNextPhase(phase, hasHunterTrigger)
// แผนผังเฟสหลัก: lobby → night → day → vote → (hunter) → night → ...
// คืนค่า: { phase, day } เฟสถัดไป (คนทรงกด advance ทีละขั้น)
// ------------------------------------------------------------
export function getNextPhase(phase, hasHunterTrigger = false) {
  switch (phase) {
    case "lobby":
      return { phase: "night", day: 1 };
    case "night":
      return { phase: "day", day: null }; // เห็นผลเช้า
    case "day":
      return { phase: "vote", day: null };
    case "vote":
      // หลังโหวต: มี Hunter โดนโหวต → เข้า hunter / ไม่มี → คืนใหม่ day+1
      return hasHunterTrigger ? { phase: "hunter", day: null } : { phase: "night", day: 1 };
    case "hunter":
      return { phase: "night", day: 1 };
    default:
      return { phase: phase || "lobby", day: null };
  }
}

// ------------------------------------------------------------
// callRole(step) — ข้อมูลสำหรับ "เรียก 1 บทบาท" (กลางคืน ข้อ 3.1)
// คนทรงเรียกทีละคน แล้วกด "เรียกถัดไป"
// คืนค่าข้อมูลที่จะโชว์/บันทึกขั้นตอน (ดู getNightOrder)
// ------------------------------------------------------------
export function callRole(players, stepType) {
  return getNightOrder(players).find((s) => s.type === stepType) || null;
}

// ------------------------------------------------------------
// markCursedTurned(cursedStatuses, uid, currentNight)
// คนทรงกด "แจ้ง Cursed กลายเป็นหมาป่า" (ข้อ 4: คืนที่ถูกกัด แจ้งด้วยปากเปล่า)
//   → ระบบ mark สถานะ turned ทันที (จริง ๆ ตรงกับ updateCursedStatus)
// คืนค่า: สถานะใหม่ของ Cursed ตัวนั้น + ข้อมูลว่าหมาป่าระบบเห็นแล้วหรือยัง
// ------------------------------------------------------------
export function markCursedTurned(cursedStatuses, uid, currentNight) {
  const next = updateCursedStatus(uid, true, currentNight);
  const canSee = canWolfSeeCursed(next.turnedNight, currentNight);
  return { cursed: next, wolfKnowsNow: canSee };
}

// ------------------------------------------------------------
// hostTransfer(meta, newUid)
// ย้าย host (ข้อ 3.6): host เดิมเป็น hostUid2, คนใหม่เป็น hostUid
// คืนค่า: meta ใหม่ที่จะเขียน
// ------------------------------------------------------------
export function hostTransfer(meta, newUid) {
  if (!meta) return null;
  return {
    hostUid: newUid,
    hostUid2: meta.hostUid // เดิมลดตำแหน่งเป็นรอง (ต่อได้ถ้าคนแรกหลุด)
  };
}

// ------------------------------------------------------------
// hostTakeOver(meta, takingUid)
// สมมติ hostUid หลุด/โดนรวบยาท → คนที่เหลือ (hostUid2) รับต่อทันที (ข้อ 3.6)
// คืนค่า meta ใหม่: อันใหม่เป็น hostUid, คนเดิมเก็บ hostUid2
// ------------------------------------------------------------
export function hostTakeOver(meta, takingUid) {
  if (!meta) return null;
  return {
    hostUid: takingUid,
    hostUid2: meta.hostUid === takingUid ? null : meta.hostUid
  };
}

// ------------------------------------------------------------
// pickNewHostAfterTimeout(players, exceptUids)
// ข้อ 3.6: มี host เดียว + หลุด 10 นาที → เลือกคนใหม่จากคนในห้องระหว่างเล่น
// คืนค่า: uid คนแรกที่ยังมีชีวิต (ไม่ใช่คนใน exceptUids) หรือ null
// ------------------------------------------------------------
export function pickNewHostAfterTimeout(players, exceptUids = []) {
  const eligible = players.filter(
    (p) => p.alive === true && !exceptUids.includes(p.uid)
  );
  return eligible.length ? eligible[0].uid : null;
}