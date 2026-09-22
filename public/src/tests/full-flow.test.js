// ============================================================
// full-flow.test.js — เทสต์ flow ทั้งเกม (งาน 10–11)
// จำลอง: กลางคืน → กลางวัน → โหวต → นายพราน → จบเกม
// ด้วยฟังก์ชัน logic จริง (vote.js / hunter.js / win-check.js)
//
// ครอบคลุม:
//   - แผนข้อ 5.3: จุดเช็กชนะทุกจุด
//   - Fool ชนะเดี่ยว (มาก่อน Lovers)
//   - Hunter ตายกลางคืน → เช้ายิง / ตายกลางวัน → ยิงทันที
//   - Cursed turned → แจ้งคืนนั้น + หมาป่ารู้คืนถัดไป
//
// วิธีรัน:  node public/src/tests/full-flow.test.js
// ============================================================
import { applyVoteResult, resolveVote } from "../vote.js";
import { applyHunterShot, hunterDie } from "../hunter.js";
import { checkWin } from "../win-check.js";
import { isWolfTeam } from "../roles.js";

let passed = 0;
let failed = 0;

const P = (uid, role, alive = true, extra = {}) => ({ uid, role, alive, name: uid, ...extra });
function check(label, cond) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}
function topic(name) {
  console.log(`\n▶ ${name}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------
// nightKill(players, victimUid) — จำลองผลกลางคืน: เปิดบทบาทคนตาย (ข้อ 3.4)
// ------------------------------------------------------------
function nightKill(players, victimUid) {
  const next = players.map((p) => ({ ...p }));
  const v = next.find((p) => p.uid === victimUid);
  if (v && v.alive) {
    v.alive = false;
    v.revealed = true; // เปิดเผยบทบาทเมื่อตาย (default revealRoleOnDeath)
  }
  return next;
}

// ------------------------------------------------------------
// canWolfSeeCursed — กติกา Cursed ข้อ 4: หมาป่าฝั่งระบบเห็น turnedNight+1
// ------------------------------------------------------------
function canWolfSeeCursed(turnedNight, currentNight) {
  return turnedNight != null && currentNight >= turnedNight + 1;
}

// ============================================================
topic("Fool ชนะเดี่ยว — โดนโหวตแม้เป็นคู่รักต่างฝ่าย (5.2 ขั้น 1, 5.3 หลังโหวต)");
{
  // 6 คน: 2 หมาป่า + fool + ชาวบ้าน 3 / lovers ต่างฝ่าย [fool, w1]
  let players = [
    P("fool", "fool"),
    P("seer", "seer"),
    P("doc", "doctor"),
    P("v", "villager"),
    P("w1", "werewolf"),
    P("w2", "werewolf")
  ];
  const lovers = ["fool", "w1"];

  // คืน 1: หมาป่าฆ่า doctor
  players = nightKill(players, "doc");
  const afterN1 = checkWin(players, lovers, null, null);
  check("หลังกลางคืนแรก → ยังไม่จบ", afterN1.winner === null);

  // ทุกคนโหวต fool
  for (const p of players) if (p.alive) p.voteTarget = "fool";
  const res = resolveVote(players);
  const out = applyVoteResult({ players, lovers, cursedStatuses: null, result: res, revealRole: true });

  check("fool ถูกโหวตออก", out.players.find((p) => p.uid === "fool").alive === false);
  check("ผู้ถูกโหวตคือ fool", res.votedOut === "fool");
  check("Lovers ตายตาม (w1 เป็นคู่รักของ fool)", out.players.find((p) => p.uid === "w1").alive === false);
  check("winner = fool (ชนะเดี่ยว ก่อน Lovers)", out.winner.winner === "fool");
}

// ============================================================
topic("Hunter ตายกลางคืน → เช้ายิง (3.4 / 4 / 5.3 หลัง Hunter ยิง)");
{
  let players = [P("H", "hunter"), P("w", "werewolf"), P("v", "villager"), P("s", "seer")];

  // คืน 1: หมาป่าฆ่า Hunter → เปิดบทบาท + ยิงตอนเช้า
  players = nightKill(players, "H");
  const hunterState = hunterDie("H", "night");
  check("Hunter ตายกลางคืน → ยิงเช้า (shootNow=false)", hunterState.shootNow === false);
  check("Hunter เปิดบทบาทแล้ว", hunterState.revealed === true);

  // เช้าถัดไป: ยิงหมาป่า
  const shot = applyHunterShot({ players, lovers: null, cursedStatuses: null, hunterState, target: "w" });
  check("ยิงหมาป่า w → ตาย", shot.players.find((p) => p.uid === "w").alive === false);
  check("หมาป่าหมด → ชาวบ้านชนะ (5.3 หลัง Hunter ยิง)", shot.winner.winner === "villagers");
  check("hunter ยิงเสร็จ (shot=true)", shot.hunterFinal.shot === true);
}

// ============================================================
topic("Hunter ตายกลางวัน (โหวต) → ยิงทันที (3.4 / 4)");
{
  let players = [P("H", "hunter"), P("w", "werewolf"), P("v", "villager"), P("s", "seer")];

  for (const p of players) if (p.alive) p.voteTarget = "H";
  const res = resolveVote(players);
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: res, revealRole: true });

  check("Hunter โดนโหวต → hunterTrigger กลางวัน", eq(out.hunterTrigger, { uid: "H", phase: "day" }));

  // ยิงทันที (กลางวัน) → เช็กชนะ
  const hunterState = hunterDie("H", "day");
  check("ตายกลางวัน → ยิงทันที (shootNow=true)", hunterState.shootNow === true);
  const shot = applyHunterShot({ players: out.players, lovers: null, cursedStatuses: null, hunterState, target: "w" });
  check("ยิงทันทีหมาป่า w → ตาย", shot.players.find((p) => p.uid === "w").alive === false);
  check("หมาป่าหมด → ชาวบ้านชนะ", shot.winner.winner === "villagers");
}

// ============================================================
topic("Cursed turned → แจ้งคืนนั้น + หมาป่ารู้คืนถัดไป (ข้อ 4, 13.2)");
{
  // คืนที่ถูกกัด (คืน 1) → status เปลี่ยนเป็น turned ทันที = "แจ้งคืนนั้น"
  const players = [P("cur", "cursed"), P("w", "werewolf"), P("v", "villager"), P("s", "seer")];
  const cursedStatuses = { cur: "turned" };

  check("Cursed turned → นับเป็นหมาป่า (isWolfTeam)", isWolfTeam("cursed", "turned") === true);
  const win = checkWin(players, null, cursedStatuses, null);
  check("นับแล้ว → หมาป่า 2 = ชาวบ้าน 2 → หมาป่าชนะ", win.winner === "wolves");

  // ฝั่งระบบ: หมาป่าเห็นได้เมื่อ ตั้งแต่วันถัดไป (turnedNight + 1)
  check("คืนที่ถูกกัด (คืน 1) → หมาป่าฝั่งระบบยังไม่เห็น", canWolfSeeCursed(1, 1) === false);
  check("คืนถัดไป (คืน 2) → หมาป่าฝั่งระบบเห็น", canWolfSeeCursed(1, 2) === true);
  check("ไม่เคยถูกกัด → ไม่เห็น", canWolfSeeCursed(null, 2) === false);

  // ยังไม่ถูกกัด → ยังนับเป็นชาวบ้าน
  const notTurned = checkWin(players, null, { cur: "village" }, null);
  check("ยังไม่ถูกกัด → หมาป่า 1 < ชาวบ้าน 3 → เล่นต่อ", notTurned.winner === null);
}

// ============================================================
topic("Flow เต็ม: lobby → night → day → vote → end (ชาวบ้านชนะ)");
{
  let players = [
    P("w1", "werewolf"),
    P("w2", "werewolf"),
    P("v1", "villager"),
    P("v2", "seer"),
    P("v3", "doctor"),
    P("v4", "villager")
  ];

  // --- คืน 1: หมาป่าฆ่า v4 ---
  players = nightKill(players, "v4");
  let r = checkWin(players, null, null, null);
  check("คืน 1: ยังไม่จบ", r.winner === null);

  // --- กลางวัน 1: ชาวบ้านโหวต w1 ออก ---
  for (const p of players) if (p.alive) p.voteTarget = "w1";
  let out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: resolveVote(players), revealRole: true });
  players = out.players;
  check("โหวต w1 ออก", players.find((p) => p.uid === "w1").alive === false);
  check("w1 ถูกเปิดบทบาท (หมาป่า)", players.find((p) => p.uid === "w1").revealed === true);
  r = checkWin(players, null, null, null);
  check("กลางวัน 1: ยังไม่จบ (หมาป่า 1 < ชาวบ้าน 3)", r.winner === null);

  // --- คืน 2: หมาป่าฆ่า v2 (seer) ---
  players = nightKill(players, "v2");
  r = checkWin(players, null, null, null);
  check("คืน 2: ยังไม่จบ (หมาป่า 1 < ชาวบ้าน 2)", r.winner === null);

  // --- กลางวัน 2: โหวต w2 ตัวสุดท้ายออก ---
  for (const p of players) if (p.alive) p.voteTarget = "w2";
  out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: resolveVote(players), revealRole: true });
  players = out.players;
  check("โหวต w2 ออก", players.find((p) => p.uid === "w2").alive === false);
  check("จบเกม — ชาวบ้านชนะ (หมาป่า=0)", out.winner.winner === "villagers");
  check("ผู้รอดคือชาวบ้าน", players.filter((p) => p.alive).every((p) => p.role !== "werewolf"));
}

// ============================================================
topic("Lovers ตายตาม → จนเหลือ 2 ต่างฝ่าย → Lovers ชนะ (5.2 ขั้น 2)");
{
  let players = [P("lovA", "villager"), P("lovB", "werewolf"), P("x", "villager")];
  const lovers = ["lovA", "lovB"];

  for (const p of players) if (p.alive) p.voteTarget = "x";
  const out = applyVoteResult({ players, lovers, cursedStatuses: null, result: resolveVote(players), revealRole: true });
  check("x ถูกโหวตออก", out.players.find((p) => p.uid === "x").alive === false);
  check("เหลือ 2 ต่างฝ่าย → Lovers ชนะ", out.winner.winner === "lovers");
}

// ============================================================
console.log(`\n====== ผลรวม: ${passed} ผ่าน / ${failed} ผิดพลาด ======`);
if (failed > 0) process.exit(1);