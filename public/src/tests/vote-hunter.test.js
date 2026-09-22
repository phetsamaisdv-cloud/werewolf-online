// ============================================================
// vote-hunter.test.js — Unit test สำหรับ vote.js + hunter.js
// ครอบคลุมแผนข้อ 3.3 (โหวต), 3.4 (การตาย/Hunter), 4, 5.2
// วิธีรัน:  node public/src/tests/vote-hunter.test.js
// ============================================================
import {
  applyVoteResult,
  getLoverOf,
  resolveVote
} from "../vote.js";
import {
  applyHunterShot,
  HUNTER_DEATH_TYPE,
  hunterDie,
  validateHunterShot
} from "../hunter.js";

// ---------- เครื่องมือ ----------
let passed = 0;
let failed = 0;

const P = (uid, role, alive = true, extra = {}) => ({ uid, role, alive, name: uid, ...extra });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

// ============================================================
topic("vote.js — resolveVote (ข้อ 3.3)");
// ฝ่ายธรรมดา: ตัวเสียงข้างมาก
{
  const players = [
    P("a", "villager", true, { voteTarget: "x" }),
    P("b", "villager", true, { voteTarget: "x" }),
    P("c", "werewolf", true, { voteTarget: "y" })
  ];
  const r = resolveVote(players);
  check("ได้คะแนนสูงสุด = 2 → ผู้แพ้คือ x", eq(r.votedOut, "x"));
  check("ไม่ใช่ tie", r.tie === false);
  check("ชื่อผู้แพ้โหวตถูกต้อง", r.votedOut === "x" && r.max === 2);
}

// คะแนนเสมอ → ไม่มีใครตาย (ข้อ 3.3)
{
  const players = [
    P("a", "villager", true, { voteTarget: "x" }),
    P("b", "villager", true, { voteTarget: "y" })
  ];
  const r = resolveVote(players);
  check("tie = true เมื่อได้ 1-1", r.tie === true);
  check("tie → votedOut = null (ไม่มีใครตาย)", r.votedOut === null);
}

// คนตายโหวตไม่ได้ + คนไม่มีโหวตไม่นับ
{
  const players = [
    P("dead", "villager", false, { voteTarget: "x" }),
    P("b", "villager", true, { voteTarget: "x" }),
    P("c", "villager", true)
  ];
  const r = resolveVote(players);
  check("โหวตของคนตายถูกตัดทิ้ง", r.totalVotes === 1);
}

// Mayor เปิดตัว = 2 เสียง (ข้อ 4)
{
  const players = [
    P("mayor", "mayor", true, { voteTarget: "x", mayorRevealed: true }),
    P("b", "villager", true, { voteTarget: "x" }),
    P("c", "werewolf", true, { voteTarget: "myself" })
  ];
  const r = resolveVote(players);
  check("mayorRevealed -> x ได้ 3 เสียง", r.tallies.x === 3 && maxOf(r) === 3);
  check("ไม่ tie", r.tie === false);
}
function maxOf(r) {
  return r.max;
}

// ไม่มีใครโหวต → votedOut null
{
  const r = resolveVote([P("a", "villager"), P("b", "villager")]);
  check("ไม่มีโหวต → ไม่มีใครตาย", r.votedOut === null && r.max === 0);
}

topic("vote.js — getLoverOf (Lovers ตายตาม)");
{
  check("หาคู่รักได้", getLoverOf(["lovA", "lovB"], "lovA") === "lovB");
  check("คนที่ไม่ใช่คู่รัก → null", getLoverOf(["lovA", "lovB"], "x") === null);
  check("lovers null → null", getLoverOf(null, "lovA") === null);
}

topic("vote.js — applyVoteResult (ข้อ 3.4 + 5.2)");
// คนถูกโหวตตาย + เปิดบทบาท
{
  const players = [P("x", "villager"), P("w", "werewolf")];
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: { votedOut: "x", tie: false } });
  check("x ตาย", out.players.find((p) => p.uid === "x").alive === false);
  check("x ถูกเปิดบทบาท", out.players.find((p) => p.uid === "x").revealed === true);
  check("deaths = ['x']", eq(out.deaths, ["x"]));
}
// ไม่เปิดบทบาทเมื่อ revealRole=false (settings.revealRoleOnDeath)
{
  const players = [P("x", "villager"), P("w", "werewolf")];
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: { votedOut: "x", tie: false }, revealRole: false });
  check("revealRole=false -> ไม่เปิดบทบาท", out.players.find((p) => p.uid === "x").revealed !== true);
}
// Tie → ไม่มีใครตาย
{
  const players = [P("x", "villager"), P("w", "werewolf")];
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: { votedOut: null, tie: true } });
  check("tie -> ไม่มีผู้ตาย", out.deaths.length === 0);
}
// Lovers ตายตาม (คนถูกโหวตเป็นคู่รัก)
{
  const players = [P("a", "villager"), P("b", "werewolf"), P("w2", "werewolf")];
  const out = applyVoteResult({ players, lovers: ["a", "b"], cursedStatuses: null, result: { votedOut: "a", tie: false } });
  check("a ถูกโหวตตาย", out.players.find((p) => p.uid === "a").alive === false);
  check("b (คู่รัก) ตายตามด้วย", out.players.find((p) => p.uid === "b").alive === false);
  check("deaths มีทั้งคู่", eq(out.deaths.sort(), ["a", "b"]));
}
// Fool ถูกโหวต → ชนะเดี่ยวทันที (ข้อ 5.2 ขั้น 1)
{
  const players = [P("fool", "fool"), P("w", "werewolf"), P("v", "villager")];
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: { votedOut: "fool", tie: false } });
  check("winner = fool", out.winner.winner === "fool");
  check("fool ตายด้วย", out.players.find((p) => p.uid === "fool").alive === false);
}
// หมาป่าถูกโหวตออกหมด → ชาวบ้านชนะ
{
  const players = [P("w", "werewolf"), P("v1", "villager"), P("v2", "seer")];
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: { votedOut: "w", tie: false } });
  check("หมาป่าถูกโหวตหมด → villagers ชนะ", out.winner.winner === "villagers");
}
// Hunter ตายกลางวันถูกโหวต → hunterTrigger (ยิงทันทีข้อ 4)
{
  const players = [P("H", "hunter"), P("w", "werewolf"), P("v", "villager")];
  const out = applyVoteResult({ players, lovers: null, cursedStatuses: null, result: { votedOut: "H", tie: false } });
  check("คนตายเป็น Hunter → hunterTrigger day", eq(out.hunterTrigger, { uid: "H", phase: "day" }));
}

// ============================================================
topic("hunter.js — hunterDie phases (ข้อ 3.4)");
{
  const night = hunterDie("H", HUNTER_DEATH_TYPE.NIGHT);
  check("ตายกลางคืน → ยิงตอนเช้า (shootNow=false)", night.shootNow === false && night.revealed === true);

  const day = hunterDie("H", HUNTER_DEATH_TYPE.DAY);
  check("ตายกลางวัน → ยิงทันที", day.shootNow === true);

  const ln = hunterDie("H", HUNTER_DEATH_TYPE.LOVERS_NIGHT);
  check("ตายเพราะคู่รักกลางคืน → ยิงเช้า", ln.shootNow === false);

  const ld = hunterDie("H", HUNTER_DEATH_TYPE.LOVERS_DAY);
  check("ตายเพราะคู่รักกลางวัน → ยิงทันที", ld.shootNow === true);
}

topic("hunter.js — validateHunterShot");
{
  const hs = hunterDie("H", HUNTER_DEATH_TYPE.DAY);
  const players = [P("H", "hunter", false), P("w", "werewolf"), P("v", "villager")];

  check("ยิงคนมีชีวิตผ่าน", validateHunterShot(players, hs, "w").ok === true);
  check("ไม่เลือกเป้า → ไม่ผ่าน", validateHunterShot(players, hs, null).ok === false);
  check("ยิงคนตาย → ไม่ผ่าน", validateHunterShot(players, hs, "H").ok === false);
  check("ไม่มีสถานะ hunter → ไม่ผ่าน", validateHunterShot(players, null, "w").ok === false);

  const shot = { ...hs, shot: true, canShoot: true };
  check("ยิงซ้ำผ่านไม่ได้", validateHunterShot(players, shot, "w").ok === false);
}

topic("hunter.js — applyHunterShot");
{
  // ยิงเป้า → ตาย + hunter ใช้สิทธิเสร็จ
  const hs = hunterDie("H", HUNTER_DEATH_TYPE.DAY);
  const players = [P("H", "hunter", false), P("w", "werewolf"), P("v", "villager")];
  const out = applyHunterShot({ players, lovers: null, cursedStatuses: null, hunterState: hs, target: "w" });
  check("ยิง w -> w ตาย", out.players.find((p) => p.uid === "w").alive === false);
  check("hunter ยิงเสร็จ (shot=true)", out.hunterFinal.shot === true);
  check("winner ถูกเช็ก (wolves=0) -> villagers", out.winner.winner === "villagers");

  // Lovers ตายตามเมื่อเป้าถูกยิง
  const hs2 = hunterDie("H", HUNTER_DEATH_TYPE.DAY);
  const players2 = [P("H", "hunter", false), P("w", "werewolf"), P("l", "villager")];
  const out2 = applyHunterShot({ players: players2, lovers: ["w", "l"], cursedStatuses: null, hunterState: hs2, target: "w" });
  check("Lovers ตายตามเป้าโดนยิง", out2.players.find((p) => p.uid === "l").alive === false);
  check("deaths มีทั้ง w + l", eq(out2.deaths.sort(), ["l", "w"]));

  // ยิงไม่ได้เมื่อ hunter state ไม่มี
  const out3 = applyHunterShot({ players, lovers: null, cursedStatuses: null, hunterState: null, target: "w" });
  check("hunterState null -> ok=false", out3.ok === false);
}

// ============================================================
console.log(`\n====== ผลรวม: ${passed} ผ่าน / ${failed} ผิดพลาด ======`);
if (failed > 0) process.exit(1);