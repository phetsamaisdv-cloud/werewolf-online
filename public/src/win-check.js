// ============================================================
// win-check.js — ตรวจเงื่อนไขชนะของ Werewolf Online v2.1
// อ้างอิงแผนข้อ 5 (เงื่อนไขชนะ v2.1 Final)
//   - 5.1 การนับฝ่าย: นับเฉพาะผู้เล่นที่ยังมีชีวิต
//   - 5.2 ลำดับการเช็กชนะ (เรียงตามนี้เป๊ะ ๆ):
//       1. Fool ถูกโหวตออก?        → Fool ชนะเดี่ยว → จบทันที
//       2. Lovers ต่างฝ่ายเหลือ 2?  → Lovers ชนะ → จบ
//       3. หมาป่า (รวม Minion+Cursed turned) = 0?  → ชาวบ้านชนะ → จบ
//       4. หมาป่า >= ชาวบ้าน?      → หมาป่าชนะ → จบ
//       5. ยังไม่จบ → เล่นต่อ (คืน null)
// ============================================================
import { isWolfTeam, getTeam } from "./roles.js";

// ------------------------------------------------------------
// cursedStatusOf(cursedStatuses, uid)
// อ่านสถานะ Cursed ของผู้เล่น uid จากออบเจกต์สถานะ
// รองรับทั้งรูป { [uid]: "turned" } และ { [uid]: { status: "turned" } }
// คืนค่า: "village" | "turned" | null (ถ้าไม่มีข้อมูล)
// ------------------------------------------------------------
function cursedStatusOf(cursedStatuses, uid) {
  if (!cursedStatuses || !cursedStatuses[uid]) return null;
  const v = cursedStatuses[uid];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && v.status) return v.status;
  return null;
}

// ------------------------------------------------------------
// aliveCount(players) — นับเฉพาะผู้เล่นที่มีชีวิต (ข้อ 5.1)
// ------------------------------------------------------------
function alivePlayers(players) {
  return players.filter((p) => p.alive);
}

// ------------------------------------------------------------
// findPlayer(players, uid) — หาผู้เล่นจาก uid (คืน object หรือ null)
// ------------------------------------------------------------
function findPlayer(players, uid) {
  return players.find((p) => p.uid === uid) || null;
}

// ------------------------------------------------------------
// isPlayerAlive(players, uid) — ผู้เล่นนี้ยังมีชีวิตอยู่ไหม
// ------------------------------------------------------------
function isPlayerAlive(players, uid) {
  const p = findPlayer(players, uid);
  return !!p && p.alive === true;
}

// ------------------------------------------------------------
// countFactions(players, cursedStatuses)
// คำนวณจำนวนหมาป่าและชาวบ้านที่ยังมีชีวิต (นับเฉพาะ alive)
// - หมาป่า  = role ที่ isWolfTeam ผ่าน (รวม Minion + Cursed turned)
// - ชาวบ้าน = ผู้เล่นที่เหลือทั้งหมด (รวม Fool + Cursed ยังไม่ถูกกัด)
// คืนค่า: { wolfCount, villageCount }
// ------------------------------------------------------------
function countFactions(players, cursedStatuses) {
  const alive = alivePlayers(players);
  let wolfCount = 0;
  for (const p of alive) {
    const curse = cursedStatusOf(cursedStatuses, p.uid);
    if (isWolfTeam(p.role, curse)) wolfCount++;
  }
  return { wolfCount, villageCount: alive.length - wolfCount };
}

// ------------------------------------------------------------
// loversClaimWin(players, lovers, cursedStatuses)
// ตรวจเงื่อนไขข้อ 5.2 ขั้นที่ 2: คู่รักต่างฝ่ายเหลือเป็น 2 คนสุดท้าย
// คืน true ถ้าคู่รักชนะ (ทั้งคู่มีชีวิต + ต่างฝ่าย + ตรงกับจำนวน alive ทั้งหมด = 2)
// ------------------------------------------------------------
function loversClaimWin(players, lovers, cursedStatuses) {
  if (!lovers || lovers.length !== 2) return false;

  const [a, b] = lovers;
  // ทั้งคู่ต้องยังมีชีวิต
  if (!isPlayerAlive(players, a) || !isPlayerAlive(players, b)) return false;

  // ต่างฝ่าย (ทีมจริงคิดจาก Cursed turned ด้วย)
  const teamA = isWolfTeam(findPlayer(players, a).role, cursedStatusOf(cursedStatuses, a))
    ? "wolf"
    : "village";
  const teamB = isWolfTeam(findPlayer(players, b).role, cursedStatusOf(cursedStatuses, b))
    ? "wolf"
    : "village";
  if (teamA === teamB) return false;

  // ต้องเหลือเพียง 2 คนสุดท้ายเท่านั้น
  return alivePlayers(players).length === 2;
}

// ============================================================
// checkWin(players, lovers, cursedStatuses, lastVoteResult)
// ตัวหลักตรวจเงื่อนไขชนะ — เรียกทุกครั้งที่มีคนตาย (ข้อ 5.3)
//
// พารามิเตอร์:
//   players:  array ของ { uid, role, alive }
//   lovers:   [uid1, uid2] หรือ null
//   cursedStatuses: { [uid]: "village"|"turned" } หรือ null
//   lastVoteResult: null หรือ { type:"vote", votedOut:uid|null, tie:bool }
//
// คืนค่า: { winner, reason }
//   winner: "villagers" | "wolves" | "lovers" | "fool" | null (เล่นต่อ)
//   reason: ข้อความอธิบายภาษาไทย
// ============================================================
export function checkWin(players, lovers, cursedStatuses, lastVoteResult) {
  // ---- ขั้นที่ 1: Fool ถูกโหวตออก → ชนะเดี่ยวทันที (มาก่อน Lovers เสมอ) ----
  if (
    lastVoteResult &&
    lastVoteResult.type === "vote" &&
    lastVoteResult.tie !== true &&
    lastVoteResult.votedOut
  ) {
    const voted = findPlayer(players, lastVoteResult.votedOut);
    if (voted && getTeam(voted.role) === "neutral") {
      return {
        winner: "fool",
        reason: "คนโง่ถูกโหวตออก → ชนะเดี่ยว เกมจบทันที (Fool มาก่อน Lovers)"
      };
    }
  }

  // ---- ขั้นที่ 2: Lovers ต่างฝ่ายเหลือ 2 คนสุดท้าย → Lovers ชนะ ----
  if (loversClaimWin(players, lovers, cursedStatuses)) {
    return {
      winner: "lovers",
      reason: "คู่รักต่างฝ่ายเหลือเป็น 2 คนสุดท้าย → คู่รักชนะ"
    };
  }

  const { wolfCount, villageCount } = countFactions(players, cursedStatuses);

  // ---- ขั้นที่ 3: หมาป่า = 0 → ชาวบ้านชนะ ----
  if (wolfCount === 0) {
    return {
      winner: "villagers",
      reason: "หมาป่าหมด (รวม Minion + Cursed ที่แปลงแล้ว) → ชาวบ้านชนะ"
    };
  }

  // ---- ขั้นที่ 4: หมาป่า >= ชาวบ้าน → หมาป่าชนะ ----
  if (wolfCount >= villageCount) {
    return {
      winner: "wolves",
      reason: `หมาป่า (${wolfCount}) >= ชาวบ้าน (${villageCount}) → ฝ่ายหมาป่าชนะ`
    };
  }

  // ---- ขั้นที่ 5: ยังไม่จบ → เล่นต่อ ----
  return { winner: null, reason: "เกมยังไม่จบ เล่นต่อ" };
}