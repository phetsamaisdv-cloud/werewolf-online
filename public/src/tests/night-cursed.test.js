// ============================================================
// night-cursed.test.js — Unit test สำหรับ night.js + cursed.js + host-control.js
// ครอบคลุมแผนข้อ 3.1 (ลำดับกลางคืน), 3.2 (โหวตหมาป่า), 4 (กติกาบทบาท),
// 3.6 (host transfer), 8 (schema night/wolf/cursed)
//
// วิธีรัน:  node public/src/tests/night-cursed.test.js
// ============================================================
import {
  ACTIONS,
  NIGHT_ORDER,
  pickWolfVictims,
  resolveNight,
  submitNightAction
} from "../night.js";
import {
  CURSED_STATUS,
  canWolfSeeCursed,
  readCursedStatus,
  updateCursedStatus
} from "../cursed.js";
import {
  callRole,
  getNightOrder,
  getNextPhase,
  hostTakeOver,
  hostTransfer,
  markCursedTurned,
  pickNewHostAfterTimeout
} from "../host-control.js";

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

// helper: roomState กลางคืนพื้นฐาน
function nightState(overrides = {}) {
  return {
    players: [],
    currentNight: 1,
    actions: {},
    wolfVotes: {},
    lovers: null,
    cursedStatuses: {},
    prevBodyguardTarget: null,
    wolfDoubleKill: false,
    wolfSickPrev: false,
    ...overrides
  };
}

// ============================================================
// 1) cursed.js
// ============================================================
topic("cursed.js — updateCursedStatus / canWolfSeeCursed (ข้อ 4)");
{
  const turned = updateCursedStatus("c1", true, 3);
  check("โดนกัด → status=turned", turned.status === CURSED_STATUS.TURNED);
  check("โดนกัด → turnedNight=3 (คืนนั้น)", turned.turnedNight === 3);

  const not = updateCursedStatus("c1", false, 3);
  check("ไม่โดนกัด → status=village", not.status === CURSED_STATUS.VILLAGE);
  check("ไม่โดนกัด → turnedNight=null", not.turnedNight === null);

  check("คืน turnedNight → ยังไม่เห็น", canWolfSeeCursed(3, 3) === false);
  check("คืนถัดไป (turnedNight+1) → เห็น", canWolfSeeCursed(3, 4) === true);
  check("turnedNight=null → ไม่เห็น", canWolfSeeCursed(null, 9) === false);
}

topic("cursed.js — readCursedStatus");
{
  const a = readCursedStatus("turned");
  check('รองรับ string "turned"', a && a.status === "turned" && a.turnedNight === null);
  const b = readCursedStatus({ status: "turned", turnedNight: 2 });
  check("รองรับ object {status,turnedNight}", b && b.turnedNight === 2);
  check("null → null", readCursedStatus(null) === null);
}

// ============================================================
// 2) night.js — submitNightAction (ข้อ 4)
// ============================================================
topic("night.js — submitNightAction validations (ข้อ 4)");
{
  const players = [
    P("doc", "doctor"),
    P("bg", "bodyguard"),
    P("witch", "witch"),
    P("cupid", "cupid"),
    P("v1", "villager"),
    P("dead", "villager", false)
  ];

  // หมอห้ามกันตัวเอง
  const selfDoc = submitNightAction(
    nightState({ players, currentNight: 1 }),
    "doc",
    ACTIONS.DOCTOR,
    "doc"
  );
  check("หมอป้องกันตัวเอง → ปฏิเสธ", selfDoc.ok === false);

  // หมอกันคนอื่นได้
  const okDoc = submitNightAction(
    nightState({ players, currentNight: 1 }),
    "doc",
    ACTIONS.DOCTOR,
    "v1"
  );
  check("หมอป้องกันคนอื่น → ผ่าน", okDoc.ok === true);

  // บอดี้การ์ด: ซ้ำคนเดิมคืนก่อน
  const repeatBg = submitNightAction(
    nightState({ players, currentNight: 2, prevBodyguardTarget: "v1" }),
    "bg",
    ACTIONS.BODYGUARD,
    "v1"
  );
  check("บอดี้การ์ดซ้ำคนเดิมคืนก่อน → ปฏิเสธ", repeatBg.ok === false);

  const selfBg = submitNightAction(
    nightState({ players, currentNight: 2, prevBodyguardTarget: "v1" }),
    "bg",
    ACTIONS.BODYGUARD,
    "bg"
  );
  check("บอดี้การ์ดกันตัวเองได้ (ไม่ซ้ำคืนก่อน)", selfBg.ok === true);

  // แม่มด: ใช้ 2 อย่างพร้อมกันไม่ได้
  const witchBoth = submitNightAction(
    nightState({
      players,
      currentNight: 1,
      pendingActions: [{ uid: "witch", type: ACTIONS.WITCH_HEAL, target: "v1" }]
    }),
    "witch",
    ACTIONS.WITCH_POISON,
    "dead"
  );
  check("แม่มดใช้พิษพร้อมกับยารักษา → ปฏิเสธ", witchBoth.ok === false);

  // คิวปิด: คืนแรกเท่านั้น + 2 คน
  const cupidOk = submitNightAction(
    nightState({ players, currentNight: 1 }),
    "cupid",
    ACTIONS.CUPID,
    ["v1", "dead"]
  );
  check("คิวปิดคืนแรกเลือกคนตาย → ปฏิเสธ", cupidOk.ok === false);

  const cupid2 = submitNightAction(
    nightState({ players, currentNight: 1 }),
    "cupid",
    ACTIONS.CUPID,
    ["v1", "doc"]
  );
  check("คิวปิดคืนแรกเลือก 2 คนมีชีวิต → ผ่าน", cupid2.ok === true);

  const cupidLate = submitNightAction(
    nightState({ players, currentNight: 2 }),
    "cupid",
    ACTIONS.CUPID,
    ["v1", "doc"]
  );
  check("คิวปิดคืนที่ 2 → ปฏิเสธ", cupidLate.ok === false);

  // เป้าต้องมีชีวิต
  const deadTarget = submitNightAction(
    nightState({ players, currentNight: 1 }),
    "doc",
    ACTIONS.DOCTOR,
    "dead"
  );
  check("เป้าหมายตายแล้ว → ปฏิเสธ", deadTarget.ok === false);

  // ผู้ส่งต้องมีชีวิต
  const deadActor = submitNightAction(
    nightState({ players: [P("x", "doctor", false)], currentNight: 1 }),
    "x",
    ACTIONS.DOCTOR,
    "y"
  );
  check("ผู้ส่งตายแล้ว → ปฏิเสธ", deadActor.ok === false);
}

// ============================================================
// 3) night.js — pickWolfVictims (ข้อ 3.2)
// ============================================================
topic("night.js — pickWolfVictims (ข้อ 3.2)");
{
  check(
    "เสียงข้างมากชนะ (2 vs 1) → เหยื่อที่ 2 เสียง",
    eq(pickWolfVictims({ w1: "a", w2: "a", w3: "b" }), ["a"])
  );
  check("เสมอกัน k=1 → ไม่มีใครตาย", eq(pickWolfVictims({ w1: "a", w2: "b" }), []));
  check("ไม่มีโหวต → []", eq(pickWolfVictims({}), []));

  // Wolf Cub double-kill (k=2): โหวตแบ่ง 1-1 → เลือกได้ทั้ง 2 (เติมช่อง)
  check(
    "k=2 โหวต 1-1 → เหยื่อ 2 คน",
    eq(pickWolfVictims({ w1: "a", w2: "b" }, 2).sort(), ["a", "b"])
  );
  check(
    "k=2 เสียง 2-1 → เหยื่อ [ที่1, ที่2]",
    eq(pickWolfVictims({ w1: "a", w2: "a", w3: "b" }, 2), ["a", "b"])
  );
}

// ============================================================
// 4) night.js — resolveNight (ข้อ 3.1 / 4)
// ============================================================
topic("night.js — resolveNight: หมาป่ากัด/กัน/ไม่มีโหวต");
{
  // ไม่มีโหวต → ไม่มีคนตาย
  const noVote = resolveNight(
    nightState({ players: [P("w1", "werewolf"), P("v1", "villager")] })
  );
  check("ไม่มี wolf votes → ไม่มีคนตาย", noVote.deaths.length === 0);

  // หมากัดไม่มีคนกัน → ตาย
  const kill = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("v1", "villager")],
      wolfVotes: { w1: "v1" }
    })
  );
  check("หมากัดไม่มีกัน → v1 ตาย", kill.deaths.includes("v1") && kill.players.find((p) => p.uid === "v1").alive === false);
  check("ผู้ตายถูกเปิดเผยบทบาท (revealRoleOnDeath default)", kill.players.find((p) => p.uid === "v1").revealed === true);

  // หมอป้องกัน → รอด
  const saved = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("v1", "villager"), P("d1", "doctor")],
      wolfVotes: { w1: "v1" },
      actions: { d1: { uid: "d1", type: ACTIONS.DOCTOR, target: "v1", used: true } }
    })
  );
  check("หมอป้องกันเหยื่อ → รอด", saved.deaths.length === 0);

  // แม่มดพิษ ทะลุการกัน
  const poison = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("v1", "villager"), P("v2", "villager"), P("wz", "witch")],
      wolfVotes: { w1: "v1" },
      actions: {
        wz: { uid: "wz", type: ACTIONS.WITCH_POISON, target: "v2", used: true }
      }
    })
  );
  check("พิษแม่มดฆ่า v2 (ไม่เกี่ยวกัน)", poison.deaths.includes("v2"));

  // ยากันอย่างเดียว → เหยื่อรอด (ใช้ 2 อย่างพร้อมกันถูก submitNightAction ปฏิเสธไว้แล้ว ข้อ 4)
  const healOnly = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("v1", "villager"), P("v2", "villager"), P("wz", "witch")],
      wolfVotes: { w1: "v1" },
      actions: {
        wz: { uid: "wz", type: ACTIONS.WITCH_HEAL, target: "v1", used: true }
      }
    })
  );
  check("ยากันอย่างเดียว → v1 รอดจากหมาป่า", healOnly.deaths.length === 0 && healOnly.players.find((p) => p.uid === "v1").alive === true);
}

topic("night.js — resolveNight: tie → ไม่มีใครตาย (ข้อ 3.3)");
{
  const r = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("w2", "werewolf"), P("v1", "villager"), P("v2", "villager")],
      wolfVotes: { w1: "v1", w2: "v2" } // เสมอ 1-1
    })
  );
  check("โหวตหมาป่าเสมอ → ไม่มีใครตาย", r.deaths.length === 0);
}

topic("night.js — resolveNight: Cursed (ข้อ 4)");
{
  // ถูกกัด → ไม่ตาย กลายเป็นหมาป่า ทันทีคืนนั้น
  const bitten = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("c1", "cursed"), P("v1", "villager")],
      wolfVotes: { w1: "c1" },
      currentNight: 5
    })
  );
  check("Cursed ถูกกัด → ไม่ตาย", bitten.deaths.length === 0 && bitten.players.find((p) => p.uid === "c1").alive === true);
  check(
    "Cursed status = turned, turnedNight = คืนนั้น",
    bitten.cursedStatuses.c1 && bitten.cursedStatuses.c1.status === "turned" && bitten.cursedStatuses.c1.turnedNight === 5
  );
  check("คืนนั้นหมาป่าระบบยังไม่เห็น (until คืนถัดไป)", bitten.wolf.knowsCursed === false);

  // Cursed ถูกกัน (หมอ) → ไม่โดนกัด → ยังเป็น village
  const protectedCursed = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("c1", "cursed"), P("d1", "doctor")],
      wolfVotes: { w1: "c1" },
      actions: { d1: { uid: "d1", type: ACTIONS.DOCTOR, target: "c1", used: true } },
      cursedStatuses: { c1: { status: CURSED_STATUS.VILLAGE, turnedNight: null } },
      currentNight: 5
    })
  );
  check(
    "Cursed ถูกกัน → ยัง village",
    protectedCursed.cursedStatuses.c1 && protectedCursed.cursedStatuses.c1.status === CURSED_STATUS.VILLAGE
  );

  // คืนถัดไป knowsCursed = true
  const nextNightKnows = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("c1", "cursed")],
      cursedStatuses: { c1: { status: "turned", turnedNight: 5 } },
      currentNight: 6
    })
  );
  check("turnedNight=5, คืน 6 → หมาป่าระบบเห็นแล้ว", nextNightKnows.wolf.knowsCursed === true);
}

topic("night.js — resolveNight: Wolf Cub / Diseased (ข้อ 4)");
{
  // Wolf Cub ตาย → คืนถัดไป double kill (2 คน คนละกัน)
  const cubNight = resolveNight(
    nightState({
      players: [P("wz", "witch"), P("cub", "wolfCub"), P("v1", "villager")],
      actions: { wz: { uid: "wz", type: ACTIONS.WITCH_POISON, target: "cub", used: true } },
      currentNight: 3
    })
  );
  check("พิษฆ่า cub → deaths มี cub", cubNight.deaths.includes("cub"));
  check("wolf.doubleKill = true (คืนถัดไป 2 เหยื่อ)", cubNight.wolf.doubleKill === true);

  const doubleKill = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("w2", "werewolf"), P("v1", "villager"), P("v2", "villager"), P("v3", "villager")],
      wolfVotes: { w1: "v1", w2: "v2" },
      wolfDoubleKill: true,
      currentNight: 4
    })
  );
  check(
    "double kill → ตาย 2 คน คนละกัน",
    doubleKill.deaths.length === 2 && doubleKill.deaths[0] !== doubleKill.deaths[1]
  );

  // Diseased ถูกหมากัด → หมาป่าป่วยคืนถัดไป
  const diseasedNight = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("d", "diseased"), P("v1", "villager")],
      wolfVotes: { w1: "d" },
      currentNight: 2
    })
  );
  check("Diseased ถูกกัด → wolfSickNext=true", diseasedNight.wolfSickNext === true && diseasedNight.wolf.sickNext === true);

  const sickNight = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("v1", "villager")],
      wolfVotes: { w1: "v1" },
      wolfSickPrev: true,
      currentNight: 3
    })
  );
  check("หมาป่าป่วย → คืนนี้กัดไม่ได้", sickNight.deaths.length === 0);
}

topic("night.js — resolveNight: ผลตรวจ Seer/Aura/Sorceress (ข้อ 3.1)");
{
  const r = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("se", "seer"), P("au", "aura"), P("so", "sorceress"), P("v1", "villager")],
      wolfVotes: { w1: "v1" },
      actions: {
        se: { uid: "se", type: ACTIONS.SEER, target: "w1", used: true },
        au: { uid: "au", type: ACTIONS.AURA, target: "w1", used: true },
        so: { uid: "so", type: ACTIONS.SORCERESS, target: "se", used: true }
      },
      currentNight: 1
    })
  );
  check("Seer ตรวจ werewolf → isWolf=true", r.results.seer && r.results.seer.isWolf === true);
  check("Aura รู้ role จริง", r.results.aura && r.results.aura.role === "werewolf");
  check("Sorceress ตรวจ Seer → isSeer=true", r.results.sorceress && r.results.sorceress.isSeer === true);
}

topic("night.js — resolveNight: Cupid / Lovers / Hunter (ข้อ 4, 3.4)");
{
  // คิวปิดคืนแรก → lovers = [a, b]
  const cupidNight = resolveNight(
    nightState({
      players: [P("cu", "cupid"), P("a", "villager"), P("b", "villager")],
      actions: { cu: { uid: "cu", type: ACTIONS.CUPID, target: ["a", "b"], used: true } },
      currentNight: 1
    })
  );
  check("Cupid คืนแรก → lovers=[a,b]", eq(cupidNight.lovers, ["a", "b"]));

  // คนรักตายตาม (หมากัด a → b ตายด้วย)
  const loverDeath = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("a", "villager"), P("b", "villager")],
      wolfVotes: { w1: "a" },
      lovers: ["a", "b"]
    })
  );
  check("คนรักตายตาม → ตาย 2 คน", loverDeath.deaths.length === 2 && loverDeath.deaths.includes("a") && loverDeath.deaths.includes("b"));

  // Hunter ตายกลางคืน → trigger phase 'night'
  const hunterNight = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("h1", "hunter")],
      wolfVotes: { w1: "h1" }
    })
  );
  check("Hunter ตายกลางคืน → hunterTriggers phase=night", hunterNight.hunterTriggers.length === 1 && hunterNight.hunterTriggers[0].phase === "night");

  // Hunter ตายเพราะคนรัก → phase lovers_night
  const hunterLover = resolveNight(
    nightState({
      players: [P("w1", "werewolf"), P("h1", "hunter"), P("b", "villager")],
      wolfVotes: { w1: "b" },
      lovers: ["h1", "b"]
    })
  );
  check("Hunter ตายเพราะคู่รัก → phase=lovers_night", hunterLover.hunterTriggers[0] && hunterLover.hunterTriggers[0].phase === "lovers_night");
}

// ============================================================
// 5) host-control.js
// ============================================================
topic("host-control.js — getNightOrder / callRole (ข้อ 3.1)");
{
  const players = [
    P("cu", "cupid"),
    P("se", "seer"),
    P("d", "doctor"),
    P("w", "werewolf"),
    P("c", "cursed"),
    P("v", "villager", false)
  ];
  const order = getNightOrder(players);
  check("ขั้นตอนแรกคือ cupid", order[0].type === ACTIONS.CUPID);
  check("ขั้นตอนสุดท้ายคือ cursed (ทุกคืน)", order[order.length - 1].type === ACTIONS.CURSED);
  check("ลำดับ: wolf มาก่อน cursed", order.findIndex((s) => s.type === ACTIONS.WOLF) < order.findIndex((s) => s.type === ACTIONS.CURSED));
  check("Cursed ยังมีชีวิต → ถูกเรียก (uids มี c)", order.find((s) => s.type === ACTIONS.CURSED).uids.includes("c"));
  check("คนตายไม่ถูกเรียก (villager false)", !order.find((s) => s.type === ACTIONS.SEER).uids.includes("v"));

  const wolfStep = callRole(players, ACTIONS.WOLF);
  check("callRole wolf → uids มี werewolf", wolfStep && wolfStep.uids.includes("w"));
  check("callRole ที่ไม่มี → null", callRole(players, "unknown") === null);
}

topic("host-control.js — getNextPhase (flow ต่อเนื่อง)");
{
  check("lobby → night day1", eq(getNextPhase("lobby"), { phase: "night", day: 1 }));
  check("night → day", eq(getNextPhase("night"), { phase: "day", day: null }));
  check("day → vote", eq(getNextPhase("day"), { phase: "vote", day: null }));
  check("vote (ไม่มี hunter) → night", eq(getNextPhase("vote", false), { phase: "night", day: 1 }));
  check("vote (มี hunter) → hunter", eq(getNextPhase("vote", true), { phase: "hunter", day: null }));
  check("hunter → night", eq(getNextPhase("hunter"), { phase: "night", day: 1 }));
}

topic("host-control.js — markCursedTurned / transfer (ข้อ 4, 3.6)");
{
  const cur = { c1: { status: "village", turnedNight: null } };
  const out = markCursedTurned(cur, "c1", 4);
  check("mark → status=turned, turnedNight=4", out.cursed.status === "turned" && out.cursed.turnedNight === 4);
  check("mark คืนเดียวกัน → wolfKnowsNow=false (รอถัดไป)", out.wolfKnowsNow === false);

  const meta = { hostUid: "A", hostUid2: "B" };
  const moved = hostTransfer(meta, "C");
  check("hostTransfer → hostUid=C, hostUid2=A (เดิมลดเป็นรอง)", moved.hostUid === "C" && moved.hostUid2 === "A");

  const took = hostTakeOver(meta, "B");
  check("hostTakeOver(B) → hostUid=B, hostUid2=A (เดิม)", took.hostUid === "B" && took.hostUid2 === "A");

  const players = [P("a", "villager", false), P("b", "villager"), P("c", "villager")];
  check("timeout → เลือกคนมีชีวิตคนแรก (ข้ามคนตาย)", pickNewHostAfterTimeout(players, ["b"]) === "c");
  check("ไม่มีใครเหลือ → null", pickNewHostAfterTimeout([P("a", "villager", false)]) === null);
}

// ============================================================
// summary
// ============================================================
console.log(`\n==============================`);
console.log(`Night+Cursed+Host control: ${passed} passed, ${failed} failed`);
console.log(`==============================`);
if (failed > 0) process.exit(1);