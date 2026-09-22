// ============================================================
// win-check.test.js — Unit test สำหรับ win-check.js + roles.js
// โปรเจค: Werewolf Online v2.1
// ครอบคลุมแผนข้อ 5.2 (ลำดับเช็กชนะ), ข้อ 5.3 (จุดเช็กชนะ),
// Fool ชนะเดี่ยว, Cursed turned → นับเป็นหมาป่า
//
// วิธีรัน:  node public/src/tests/win-check.test.js
// ============================================================
import { ROLE, getTeam, isWolfTeam } from "../roles.js";
import { checkWin } from "../win-check.js";

// ---------- เครื่องมือเทสต์เล็ก ๆ (ไม่มี framework) ----------
let passed = 0;
let failed = 0;

// ย่อการสร้างผู้เล่น
const P = (uid, role, alive = true) => ({ uid, role, alive });
// ย่อการสร้างผลโหวต
const vote = (votedOut, tie = false) => ({ type: "vote", votedOut, tie });

// ตรวจว่า values ทั้งหมดตรงกัน (deep equal แบบง่าย)
function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
    console.error(`        expected ${e}`);
    console.error(`        actual   ${a}`);
  }
}

// ตรวจว่า actual (expect) ตรง expected
function topic(name) {
  console.log(`\n▶ ${name}`);
}

// ---------- เทสต์ roles.js (ข้อ 2) ----------
topic("roles.js — บทบาท + ทีม");
assertDeepEqual(getTeam("seer"), "village", "Seer อยู่ในฝ่ายชาวบ้าน");
assertDeepEqual(getTeam("werewolf"), "wolf", "Werewolf อยู่ในฝ่ายหมาป่า");
assertDeepEqual(getTeam("fool"), "neutral", "Fool เป็นกลาง");
assertDeepEqual(getTeam(ROLE.witch), "village", "getTeam รองรับ object ด้วย");

assertDeepEqual(isWolfTeam("werewolf"), true, "Werewolf นับเป็นหมาป่า");
assertDeepEqual(isWolfTeam("wolfCub"), true, "Wolf Cub นับเป็นหมาป่า");
assertDeepEqual(isWolfTeam("sorceress"), true, "Sorceress นับเป็นหมาป่า");
assertDeepEqual(isWolfTeam("minion"), true, "Minion นับเป็นหมาป่า (ข้อ 5.1)");
assertDeepEqual(isWolfTeam("villager"), false, "Villager ไม่นับเป็นหมาป่า");

// -------- Cursed: ยังไม่ถูกกัด = ชาวบ้าน / ถูกกัด = หมาป่า (ข้อ 4, 5.1) --------
assertDeepEqual(isWolfTeam("cursed", "village"), false, "Cursed ก่อนกัด = ชาวบ้าน");
assertDeepEqual(isWolfTeam("cursed", "turned"), true, "Cursed turned = หมาป่า");
assertDeepEqual(isWolfTeam("cursed"), false, "Cursed ไม่มี status = ชาวบ้าน");

// ---------- เทสต์ checkWin (ข้อ 5.2 ในลำดับ) ----------

topic("5.2 ขั้น 1 — Fool ถูกโหวตออก ชนะเดี่ยวทันที");
{
  const players = [
    P("fool", "fool"),
    P("w1", "villager"),
    P("w2", "werewolf")
  ];
  assertDeepEqual(
    checkWin(players, null, null, vote("fool")),
    { winner: "fool", reason: "คนโง่ถูกโหวตออก → ชนะเดี่ยว เกมจบทันที (Fool มาก่อน Lovers)" },
    "Fool ถูกโหวต → fool ชนะทันที"
  );
}

// Fool มาก่อน Lovers เสมอ: Fool ถูกโหวตพร้อมคู่รักต่างฝ่ายเหลือ 2
topic("5.2 ขั้น 1 — Fool มาก่อน Lovers (ถูกโหวตพร้อมคู่รัก)");
{
  const players = [
    P("fool", "fool"),
    P("lova", "villager"),
    P("lovb", "werewolf")
  ];
  assertDeepEqual(
    checkWin(players, ["lova", "lovb"], null, vote("fool")),
    { winner: "fool", reason: "คนโง่ถูกโหวตออก → ชนะเดี่ยว เกมจบทันที (Fool มาก่อน Lovers)" },
    "Fool ชนะเดี่ยวแม้ Lovers ต่างฝ่ายเหลือ 2 อยู่"
  );
}

// ชนะเสมอ → ไม่มีคนถูกโหวตออก → ไม่เข้าเงื่อนไข Fool
topic("5.2 ขั้น 1 — คะแนนเสมอ (Tie) ไม่ให้ Fool ชนะ");
{
  const players = [
    P("fool", "fool"),
    P("w1", "werewolf"),
    P("w2", "villager")
  ];
  assertDeepEqual(
    checkWin(players, null, null, vote(null, true)),
    { winner: null, reason: "เกมยังไม่จบ เล่นต่อ" },
    "Tie โหวต → ไม่ถูกนับว่า Fool โดนโหวตออก (หมาป่า 1 < ชาวบ้าน 2 → เล่นต่อ)"
  );
}

// โหวตคนอื่นที่ไม่ใช่ Fool → ผ่านไปขั้นถัดไป
topic("5.2 ขั้น 1 — โหวตคนอื่นไม่ใช่ Fool");
{
  const players = [
    P("villagerX", "villager", false),
    P("w1", "werewolf"),
    P("w2", "villager")
  ];
  const r = checkWin(players, null, null, vote("villagerX"));
  assertDeepEqual(r.winner !== "fool", true, "ไม่ใช่ Fool → ไม่ชนะเดี่ยว (ไปตรวจขั้นอื่น)");
}

topic("5.2 ขั้น 2 — Lovers ต่างฝ่ายเหลือ 2 คนสุดท้าย → Lovers ชนะ");
{
  const players = [
    P("lova", "villager"),
    P("lovb", "werewolf"),
    P("d1", "seer", false),
    P("d2", "witch", false)
  ];
  assertDeepEqual(
    checkWin(players, ["lova", "lovb"], null, null),
    { winner: "lovers", reason: "คู่รักต่างฝ่ายเหลือเป็น 2 คนสุดท้าย → คู่รักชนะ" },
    "Lovers ต่างฝ่ายเหลือ 2 → lovers ชนะ"
  );
}

// Lovers ต่างฝ่ายเหลือ 2 แต่ยังมีคนที่ 3 → ไม่ชนะ / ตรวจ wolf แทน
topic("5.2 ขั้น 2 — Lovers ต่างฝ่าย แต่ยังมีคนที่ 3");
{
  const players = [
    P("lova", "villager"),
    P("lovb", "werewolf"),
    P("c1", "villager")
  ];
  assertDeepEqual(
    checkWin(players, ["lova", "lovb"], null, null),
    { winner: null, reason: "เกมยังไม่จบ เล่นต่อ" },
    "Lovers ต่างฝ่าย แต่ยังมีคนที่ 3 → ยังไม่จบ (หมาป่า 1 < ชาวบ้าน 2 => เล่นต่อ)"
  );
}

// Lovers ฝ่ายเดียวกัน (2 ชาวบ้าน) ไม่ได้ชนะ → แล้วจำนวนหมาป่าเป็นตัวตัดสิน
topic("5.2 ขั้น 2 — Lovers ฝ่ายเดียวกันไม่ชนะ");
{
  const players = [
    P("lova", "villager"),
    P("lovb", "villager")
  ];
  assertDeepEqual(
    checkWin(players, ["lova", "lovb"], null, null),
    { winner: "villagers", reason: "หมาป่าหมด (รวม Minion + Cursed ที่แปลงแล้ว) → ชาวบ้านชนะ" },
    "Lovers ฝ่ายเดียวกัน เหลือ 2 → ชาวบ้านชนะ (หมาป่า=0)"
  );
}

// Lovers ต่างฝ่าย แต่มี Cursed turned ประกอบ → ยังพิจารณาทีมจริง (ข้อ 5.1)
topic("5.2 ขั้น 2 — Lovers ต่างฝ่าย (ฝ่ายจริงคิดจาก Cursed)");
{
  const players = [
    P("lova", "cursed"), // ถูกกัดแล้ว → ตอนนี้เป็นฝ่ายหมาป่า
    P("lovb", "villager"),
    P("d1", "seer", false)
  ];
  const cursed = { lova: "turned" };
  assertDeepEqual(
    checkWin(players, ["lova", "lovb"], cursed, null),
    { winner: "lovers", reason: "คู่รักต่างฝ่ายเหลือเป็น 2 คนสุดท้าย → คู่รักชนะ" },
    "Cursed turned ฝ่ายจริงคือหมาป่า → คู่รักต่างฝ่ายจริง"
  );
}

topic("5.2 ขั้น 3 — หมาป่า = 0 → ชาวบ้านชนะ");
{
  const players = [
    P("v1", "villager"),
    P("v2", "seer"),
    P("dead", "werewolf", false)
  ];
  assertDeepEqual(
    checkWin(players, null, null, null),
    { winner: "villagers", reason: "หมาป่าหมด (รวม Minion + Cursed ที่แปลงแล้ว) → ชาวบ้านชนะ" },
    "หมาป่าตายหมด → ชาวบ้านชนะ"
  );
}

topic("5.2 ขั้น 3 — Minion ตาย แต่หมาป่ายังชนะ (13.2 edge case)");
{
  const players = [
    P("minion", "minion"),
    P("v1", "villager"),
    P("werewolf", "werewolf", false)
  ];
  assertDeepEqual(
    checkWin(players, null, null, null),
    { winner: "wolves", reason: "หมาป่า (1) >= ชาวบ้าน (1) → ฝ่ายหมาป่าชนะ" },
    "Minion นับเป็นหมาป่า แม้ Werewolf ตาย → หมาป่ายังชนะ"
  );
}

topic("5.2 ขั้น 4 — หมาป่า >= ชาวบ้าน → หมาป่าชนะ");
{
  const players = [
    P("w1", "werewolf"),
    P("w2", "werewolf"),
    P("v1", "villager")
  ];
  assertDeepEqual(
    checkWin(players, null, null, null),
    { winner: "wolves", reason: "หมาป่า (2) >= ชาวบ้าน (1) → ฝ่ายหมาป่าชนะ" },
    "หมาป่า 2 ต่อชาวบ้าน 1 → หมาป่าชนะ"
  );
}

topic("5.2 ขั้น 5 — ยังไม่จบ (เล่นต่อ)");
{
  const players = [
    P("w1", "werewolf"),
    P("v1", "villager"),
    P("v2", "seer")
  ];
  assertDeepEqual(
    checkWin(players, null, null, null),
    { winner: null, reason: "เกมยังไม่จบ เล่นต่อ" },
    "หมาป่า 1 ต่อชาวบ้าน 2 → ยังไม่จบ"
  );
}

// ---------- ข้อ 5.3: จุดที่ต้องเช็กชนะ (จำลองสถานะผลลัพธ์) ----------

topic("5.3 หลังจบกลางคืน — หมาป่าฆ่าแล้วเกมจบ");
{
  const players = [
    P("w1", "werewolf"),
    P("v1", "villager", false), // โดนฆ่ากลางคืน
    P("v2", "villager")
  ];
  assertDeepEqual(
    checkWin(players, null, null, null),
    { winner: "wolves", reason: "หมาป่า (1) >= ชาวบ้าน (1) → ฝ่ายหมาป่าชนะ" },
    "กลางคืนทำให้หมาป่า = ชาวบ้าน → หมาป่าชนะ"
  );
}

topic("5.3 หลังจบโหวต — หมาป่าถูกโหวตออกหมด");
{
  const players = [
    P("w1", "werewolf", false),
    P("v1", "villager"),
    P("v2", "seer")
  ];
  assertDeepEqual(
    checkWin(players, null, null, vote("w1")),
    { winner: "villagers", reason: "หมาป่าหมด (รวม Minion + Cursed ที่แปลงแล้ว) → ชาวบ้านชนะ" },
    "โหวตหมาป่าออก → ชาวบ้านชนะ"
  );
}

topic("5.3 หลัง Witch วางยา (Lovers ตายตามคนรัก)");
{
  // Witch วางยาร Lovb → ทางระบบ Lovers ตายตามกัน → เหลือ 2 ต่างฝ่าย
  const players = [
    P("lova", "villager"),
    P("lovb", "werewolf"),
    P("ghost", "witch", false)
  ];
  assertDeepEqual(
    checkWin(players, ["lova", "lovb"], null, null),
    { winner: "lovers", reason: "คู่รักต่างฝ่ายเหลือเป็น 2 คนสุดท้าย → คู่รักชนะ" },
    "Witch วางยา → Lovers เหลือ 2 ต่างฝ่าย → Lovers ชนะ"
  );
}

topic("5.3 หลัง Hunter ยิง (เช็กหลังยิง)");
{
  // Hunter ตายเช้า → ยิงหมาป่า → เหลือ 1-1 : หมาป่าชนะ
  const players = [
    P("hunter", "hunter", false),
    P("w1", "werewolf"),
    P("v1", "villager")
  ];
  assertDeepEqual(
    checkWin(players, null, null, null),
    { winner: "wolves", reason: "หมาป่า (1) >= ชาวบ้าน (1) → ฝ่ายหมาป่าชนะ" },
    "Hunter ยิงไปแล้วหมาป่ายังเท่า → เช็กชนะต่อ"
  );
}

topic("5.3 หลัง Wolf Cub ตาย (จากโหวต) ยอดหมาป่าลด");
{
  const players = [
    P("cub", "wolfCub", false),
    P("w1", "werewolf"),
    P("v1", "villager"),
    P("v2", "seer")
  ];
  assertDeepEqual(
    checkWin(players, null, null, vote("cub")),
    { winner: null, reason: "เกมยังไม่จบ เล่นต่อ" },
    "Wolf Cub ตาย → เหลือหมาป่า 1 ต่อชาวบ้าน 2 → เล่นต่อ (เสียงถัดไปหมาป่าฆ่า 2)"
  );
}

topic("5.3 หลัง Cursed กลายเป็นหมาป่า (นับเป็นหมาป่าทันที)");
{
  const players = [
    P("cur", "cursed"),
    P("w1", "werewolf"),
    P("v1", "villager")
  ];
  const cursed = { cur: "turned" };
  assertDeepEqual(
    checkWin(players, null, cursed, null),
    { winner: "wolves", reason: "หมาป่า (2) >= ชาวบ้าน (1) → ฝ่ายหมาป่าชนะ" },
    "Cursed turned → รวมกับหมาป่า = 2 → หมาป่าชนะ"
  );
}

// Cursed ยังไม่ถูกกัด → นับเป็นชาวบ้าน (ข้อ 5.1)
topic("Cursed ยังไม่ถูกกัด — นับเป็นชาวบ้าน");
{
  const players = [
    P("cur", "cursed"),
    P("w1", "werewolf"),
    P("v1", "villager")
  ];
  const cursed = { cur: "village" };
  assertDeepEqual(
    checkWin(players, null, cursed, null),
    { winner: null, reason: "เกมยังไม่จบ เล่นต่อ" },
    "Cursed ยังเป็นฝ่ายชาวบ้าน (หมาป่า 1 ต่อชาวบ้าน 2) → เล่นต่อ"
  );
}

// อยู่ในรูป object { status } ก็อ่านได้
topic("cursedStatuses รูป { status: ... }");
{
  const players = [
    P("cur", "cursed"),
    P("w1", "werewolf"),
    P("v1", "villager")
  ];
  const cursed = { cur: { status: "turned" } };
  assertDeepEqual(
    checkWin(players, null, cursed, null),
    { winner: "wolves", reason: "หมาป่า (2) >= ชาวบ้าน (1) → ฝ่ายหมาป่าชนะ" },
    "รองรับรูปแบบ { uid: { status: 'turned' } }"
  );
}

// ============================================================
console.log(`\n====== ผลรวม: ${passed} ผ่าน / ${failed} ผิดพลาด ======`);
if (failed > 0) process.exit(1);