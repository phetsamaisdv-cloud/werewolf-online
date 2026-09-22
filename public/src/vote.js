// ============================================================
// vote.js — ระบบโหวตกลางวัน + ตัดสินผล
// อ้างอิงแผนข้อ 3.3 (การโหวต), 3.4 (การตาย), 5.2 (เช็กชนะ)
//   - โหวตแบบเปิด เห็นเรียลไทม์
//   - เปลี่ยนใจได้จนหมดเวลา (ตั้ง voteTarget ใหม่/ล้างได้)
//   - คะแนนเสมอ (Tie) → ไม่มีใครตายในรอบนั้น
//   - คนตายกลายเป็น Spectator (alive=false)
//   - เช็ก Fool ถูกโหวตออก / Lovers ตายตาม ผ่าน checkWin
//   - Mayor เปิดตัวแล้ว → โหวตมีน้ำหนัก 2 เสียง (ข้อ 4)
// ============================================================
import { checkWin } from "./win-check.js";

// ------------------------------------------------------------
// resolveVote(players) — นับคะแนนโหวตจากผู้เล่น
// รับ: players = array ของ { uid, name, alive, voteTarget, mayorRevealed }
//      - นับเฉพาะคนที่ยังมีชีวิตและมี voteTarget
//      - mayorRevealed === true → นับ 2 เสียง (นายกเทศมนตรี ข้อ 4)
// เปลี่ยนใจ = เจ้าของโหวตเปลี่ยน voteTarget ที่ player node ของตัวเอง
// คืนค่า: { tallies, totalVotes, max, tie, votedOut }
//         votedOut = uid ของผู้แพ้โหวต | null (เสมอ/ไม่มีเสียงโหวต)
// ------------------------------------------------------------
export function resolveVote(players) {
  const tallies = {};
  const voters = players.filter((p) => p.alive === true && p.voteTarget);

  for (const voter of voters) {
    // Mayor ที่เปิดตัวแล้ว โหวตคิดเป็น 2 เสียง (แผนข้อ 4)
    const weight = voter.mayorRevealed === true ? 2 : 1;
    tallies[voter.voteTarget] = (tallies[voter.voteTarget] || 0) + weight;
  }

  // หาคะแนนสูงสุด
  let max = 0;
  for (const n of Object.values(tallies)) if (n > max) max = n;

  // คนที่ได้คะแนนสูงสุด (อาจมีหลายคน = เสมอ)
  const leaders = Object.keys(tallies).filter((uid) => tallies[uid] === max);
  const tie = leaders.length > 1;
  // เสมอ → ไม่มีใครตาย (ข้อ 3.3)
  const votedOut = !tie && max > 0 ? leaders[0] : null;

  return { tallies, totalVotes: voters.length, max, tie, votedOut };
}

// ------------------------------------------------------------
// getLoverOf(lovers, uid) — หาคนรักของ uid (Lovers ตายตามกัน)
// คืนค่า: uid ของคู่รัก หรือ null ถ้าไม่ใช่คู่รัก
// ------------------------------------------------------------
export function getLoverOf(lovers, uid) {
  if (!lovers || lovers.length !== 2) return null;
  const [a, b] = lovers;
  if (a === uid) return b;
  if (b === uid) return a;
  return null;
}

// ------------------------------------------------------------
// applyVoteResult({ players, lovers, cursedStatuses, result, revealRole })
// ใช้ผลโหวต (จาก resolveVote) ไปลงสถานะจริง:
//   1. คนถูกโหวตออก → alive=false (+ revealed เปิดบทบาท ตามเกมปกติ)
//   2. Lovers ตายตามถ้าคนถูกโหวตเป็นคู่รัก
//   3. เช็กชนะ (Fool มาก่อน Lovers ตาม 5.2) + ตรวจ Hunter เล่นต่อ
// รับ: revealRole = เปิดบทบาทคนตายหรือไม่ (map จาก settings.revealRoleOnDeath)
// คืนค่า: { players(ชุดใหม่), deaths[], winner, hunterTrigger|null }
//         hunterTrigger = { uid, phase:"day" } ถ้าคนตายเป็น Hunter ในกลางวัน
// ============================================================
export function applyVoteResult({ players, lovers, cursedStatuses, result, revealRole = true }) {
  // สำเนาผู้เล่นชุดใหม่ (ไม่แก้ state เดิม)
  const next = players.map((p) => ({ ...p }));
  const deaths = [];

  if (result && result.votedOut) {
    const victim = next.find((p) => p.uid === result.votedOut);
    if (victim && victim.alive) {
      victim.alive = false;
      if (revealRole) victim.revealed = true; // เปิดเผยบทบาทเมื่อตาย (ข้อ 3.4)
      deaths.push(victim.uid);
    }

    // Lovers ตายตาม ★
    const partner = getLoverOf(lovers, result.votedOut);
    if (partner && partner !== result.votedOut) {
      const lover = next.find((p) => p.uid === partner);
      if (lover && lover.alive) {
        lover.alive = false;
        if (revealRole) lover.revealed = true;
        deaths.push(lover.uid);
      }
    }
  }

  // เช็กชนะทุกครั้งที่มีคนตาย (ข้อ 5.3) — Fool ถูกโหวต → จบก่อนเสมอ
  const winner = checkWin(next, lovers, cursedStatuses, {
    type: "vote",
    votedOut: result ? result.votedOut : null,
    tie: result ? !!result.tie : false
  });

  // ถ้าคนตายเป็น Hunter (ตายกลางวัน) → เปิดบทบาท + ยิงทันที (ข้อ 3.4)
  let hunterTrigger = null;
  for (const uid of deaths) {
    const p = next.find((x) => x.uid === uid);
    if (p && p.role === "hunter") {
      hunterTrigger = { uid, phase: "day" };
      break;
    }
  }

  return { players: next, deaths, winner, hunterTrigger };
}