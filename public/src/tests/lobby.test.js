// ============================================================
// lobby.test.js — Unit test สำหรับ room-utils.js (รหัสห้อง + แจกบทบาท)
// อ้างอิงแผนข้อ 7.1 (Room Code), 4 (Mason = 2), 7.2 (auto-fit บทบาท)
//
// วิธีรัน:  node public/src/tests/lobby.test.js
// ============================================================
import {
  assignRolesToPlayers,
  buildRoleDeck,
  genRoomCode,
  normalizePlayers,
  shuffle
} from "../room-utils.js";
import { defaultSettings, recommendedWolfCount } from "../settings-store.js";

let passed = 0;
let failed = 0;

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

const isWolfRole = (id) => ["werewolf", "sorceress", "wolfCub", "minion"].includes(id);

// ============================================================
topic("room-utils.js — genRoomCode (ข้อ 7.1)");
{
  const c = genRoomCode();
  check("รหัสยาว 4 ตัว", c.length === 4);
  check("รหัสสุ่ม 2 ชุดไม่ซ้ำกัน", genRoomCode() !== c);
  const legal = /^[A-Z0-9]{4}$/;
  check("รหัสอยู่ในชุดที่ยอมรับ (ไม่มี I/O/1/0)", legal.test(c) && !/[IO10]/.test(c));
}

// ============================================================
topic("room-utils.js — buildRoleDeck (ข้อ 4 / 7.2)");
{
  // 8 คน แบบ default (ทุกบทบาทเปิด, หมาป่า 2)
  {
    const { ok, deck, warned } = buildRoleDeck(8, defaultSettings());
    check("ขึ้นได้ + จำนวนตรง (8)", ok && deck.length === 8);
    check("หมาป่า 2 ตัว (ข้อ 5.1)", deck.filter(isWolfRole).length === 2);
    check("ซีตไม่ซ้ำกันทั้งหมด", new Set(deck).size === 8);
    check("warned บอกบทบาทที่ถูกตัด (default 8 คน มีหลายตัวเกิน)", warned !== null);
  }

  // 16 คน แบบ default → ใส่ได้ครบทุกบทบาท
  {
    const { ok, deck, warned } = buildRoleDeck(16, defaultSettings());
    check("16 คน → ใส่ได้ครบ (warned ว่าง)", ok && warned === null && deck.length === 16);
  }

  // ตั้งเอง: หมาป่า 1 + ชาวบ้านเท่านั้น
  {
    const s = defaultSettings();
    s.wolfCount = 1;
    for (const id of Object.keys(s.enabledRoles)) {
      if (id !== "werewolf" && id !== "villager") s.enabledRoles[id] = false;
    }
    const { ok, deck } = buildRoleDeck(5, s);
    check("หมาป่า 1 + ชาวบ้าน 4 (รวม 5)", ok && deck.filter(isWolfRole).length === 1 && deck.length === 5);
    check("มี werewolf เป็นหมาป่า", deck.includes("werewolf"));
  }

  // Mason บังคับ 2 คน (ข้อ 4)
  {
    const s = defaultSettings();
    s.wolfCount = 1;
    const allow = { werewolf: true, mason: true, villager: true };
    for (const id of Object.keys(s.enabledRoles)) s.enabledRoles[id] = !!allow[id];
    const { ok, deck } = buildRoleDeck(4, s);
    check("mason 2 คน + werewolf 1 + villager 1", ok && deck.filter((r) => r === "mason").length === 2 && deck.length === 4);
  }

  // auto-fit: ผู้เล่นน้อย → ตัดบทบาทพิเศษช่องท้าย ๆ ออก แต่หมาป่าครบ
  {
    const s = defaultSettings();
    s.wolfCount = 2;
    const { ok, deck, warned } = buildRoleDeck(6, s);
    check("6 คน → ยังขึ้นได้ (auto-fit)", ok && deck.length === 6);
    check("หมาป่ายัง 2 ตัว", deck.filter(isWolfRole).length === 2);
    check("warned แจ้งบทบาทโดนตัด", warned !== null);
  }
}

// ============================================================
topic("room-utils.js — shuffle / assignRolesToPlayers");
{
  const a = [1, 2, 3, 4];
  const b = shuffle(a);
  check("shuffle คืน array ใหม่แบบเดียวกัน", b.length === a.length && a.every((x) => b.includes(x)));

  const players = [
    { uid: "u1", name: "A" },
    { uid: "u2", name: "B" }
  ];
  const assigned = assignRolesToPlayers(players, ["seer", "werewolf"]);
  check("u1 ได้บทบาทแรก (seer)", assigned.u1 && assigned.u1.role === "seer" && assigned.u1.team === "village");
  check("u2 ได้บทบาทที่สอง (werewolf)", assigned.u2 && assigned.u2.role === "werewolf");
}

// ============================================================
topic("room-utils.js — normalizePlayers (อ่าน /players ให้ p.uid ใช้ได้)");
{
  // DB เก็บ players เป็น { key=uid: { name, alive, ... } } โดยไม่มี field uid ใน value
  // UI ต้อง normalize ให้ object ทุกตัวมี uid จาก key ไม่งั้น core (p.uid) พังทั้งเกม
  const raw = {
    userA: { name: "A", alive: true, joinedAt: 1 },
    userB: { name: "B", alive: false, joinedAt: 2 }
  };
  const arr = normalizePlayers(raw);
  check("array มี 2 คน", arr.length === 2);
  check("uid ถูกเติมจาก key (userA)", arr.find((p) => p.uid === "userA") !== undefined);
  check("uid ถูกเติมจาก key (userB)", arr.find((p) => p.uid === "userB") !== undefined);
  check("ข้อมูลเดิมยังครบ (name/alive)", arr.find((p) => p.uid === "userA").name === "A" && arr.find((p) => p.uid === "userB").alive === false);
  check("input ว่าง → []", Array.isArray(normalizePlayers(null)) && normalizePlayers(null).length === 0);
}

// ============================================================
topic("settings-store.js — recommendedWolfCount (Balance ข้อ 14)");
{
  check("5–9 คน → 2 ตัว", recommendedWolfCount(5) === 2 && recommendedWolfCount(9) === 2);
  check("10–12 คน → 3 ตัว", recommendedWolfCount(10) === 3 && recommendedWolfCount(12) === 3);
  check("13–16 คน → 3 ตัว (ช่วง 3–4 เลือกต่ำสุด)", recommendedWolfCount(13) === 3 && recommendedWolfCount(16) === 3);
}

// ============================================================
console.log(`\n==============================`);
console.log(`Lobby/Room utils: ${passed} passed, ${failed} failed`);
console.log(`==============================`);
if (failed > 0) process.exit(1);