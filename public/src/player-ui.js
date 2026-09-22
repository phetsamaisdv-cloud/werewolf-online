// ============================================================
// player-ui.js — หน้าผู้เล่น: เฟสกลางวัน / โหวต / นายพราน
// อ้างอิงแผนข้อ 6 (หน้ากลางวัน+โหวต) + ข้อ 3.3 / 3.4 / 4 / 8
// หลักการ: logic อยู่ที่ vote.js / hunter.js / win-check.js
//          ไฟล์นี้เป็นเพียงตัว render + ผูก Firebase เท่านั้น
//
// ไฟล์นี้จะทำงานจริงเมื่อแทนค่า firebaseConfig ใน firebase.js
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, onValue, set, update } from "firebase/database";
import { applyVoteResult, resolveVote } from "./vote.js";
import { applyHunterShot, hunterDie } from "./hunter.js";

// ตัวแปรสถานะกลาง (global ภายในไฟล์นี้)
let roomCode = null;            // รหัสห้องจาก URL ?room=XXXX
let myUid = null;               // uid ของตัวเอง (มาจาก Firebase Auth)
let room = null;                // สแนปช็อตทั้งโหนด /rooms/{code} ที่ subscribe
let myRole = null;              // บทบาทของตัวเอง (อ่านจาก /secret/roles)
let selectedTarget = null;      // เป้าที่กำลังเลือก (โหวต/ยิง) ยังไม่ยืนยัน

// แมปชื่อเฟส → ภาษาไทย (ใช้แสดงเท่านั้น ไม่ส่งผลกับ logic)
const PHASE_TH = {
  lobby: "ล็อบบี้",
  night: "กลางคืน",
  day: "กลางวัน",
  vote: "โหวต",
  hunter: "นายพราน",
  end: "จบเกม"
};

// ------------------------------------------------------------
// $id(...) — ย่อการค้นหา DOM โดย id
// ------------------------------------------------------------
const $id = (n) => document.getElementById(n);

// ------------------------------------------------------------
// getQueryParam(name) — อ่าน query string (เช่น ?room=ABCD)
// ------------------------------------------------------------
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ------------------------------------------------------------
// isHost() — ตัวเราเป็นคนทรงไหม (hostUid หรือ hostUid2)
// ------------------------------------------------------------
function isHost() {
  const meta = room && room.meta;
  return !!meta && (meta.hostUid === myUid || meta.hostUid2 === myUid);
}

// ------------------------------------------------------------
// alivePlayers() — รายชื่อผู้เล่นที่ยังมีชีวิต (เรียงตาม joinedAt)
// คืนค่า: array ของ { uid, name, alive, voteTarget, mayorRevealed, role }
// ------------------------------------------------------------
function alivePlayers() {
  if (!room || !room.players) return [];
  return Object.values(room.players)
    .filter((p) => p.alive === true)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

// ------------------------------------------------------------
// renderTopbar() — แถบบน: รหัสห้อง + วันที่ + เฟส
// ------------------------------------------------------------
function renderTopbar() {
  $id("room-code").textContent = roomCode;
  $id("day-label").textContent = `วัน ${room && room.meta ? room.meta.day : 0}`;
  $id("phase-label").textContent = PHASE_TH[(room && room.meta && room.meta.phase) || "lobby"];
}

// ------------------------------------------------------------
// render() — ตัวกระจาย: แสดงเฟสที่ถูกต้องตาม meta.phase
// ------------------------------------------------------------
function render() {
  if (!room || !room.meta || !myUid) return;
  renderTopbar();

  const phase = room.meta.phase;
  // ซ่อนหน้าจอทั้งหมดก่อน แล้วค่อยเปิดเฉพาะเฟส
  ["day", "vote", "hunter", "night", "end"].forEach((s) => $id(`screen-${s}`).classList.add("hidden"));

  switch (phase) {
    case "day": return renderDay();
    case "vote": return renderVote();
    case "hunter": return renderHunter();
    case "night": return $id("screen-night").classList.remove("hidden");
    case "end": return renderEnd();
    default: $id("screen-night").classList.remove("hidden");
  }
}

// ------------------------------------------------------------
// renderEnd() — แสดงผลผู้ชนะ ตาม /meta/winner
// ------------------------------------------------------------
function renderEnd() {
  $id("screen-end").classList.remove("hidden");
  const w = room.meta.winner || "???";
  const map = {
    villagers: ["เกมจบ — ชาวบ้านชนะ! 🎉", "win"],
    wolves: ["เกมจบ — หมาป่าชนะ! 🐺", "lose"],
    lovers: ["เกมจบ — คู่รักชนะ! 💞", "win"],
    fool: ["เกมจบ — คนโง่ชนะเดี่ยว! 🤡", "lose"]
  };
  const [text, cls] = map[w] || ["เกมจบ", ""];
  const t = $id("end-title");
  t.textContent = text;
  t.className = cls;
  $id("end-reason").textContent = `winner = "${w}" (รายละเอียดตามข้อ 5.2)`;
}

// ------------------------------------------------------------
// renderPlayerList(targetEl, opts)
// สร้าง <li> ของผู้เล่นแต่ละคน
//   opts: { selectable, selectedUid, onTap, showCount, showRole }
// ใช้กับเฟส day / vote / hunter
// ------------------------------------------------------------
function renderPlayerList(targetEl, opts = {}) {
  targetEl.innerHTML = "";
  const list = opts.includeDead ? Object.values(room.players) : alivePlayers();

  for (const p of list) {
    const li = document.createElement("li");
    li.className = "player-list-item";
    if (p.alive !== true) li.classList.add("dead");
    if (p.uid === myUid) li.classList.add("me");

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = (p.name || "?").charAt(0).toUpperCase();
    li.appendChild(avatar);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.name || "(?)";
    if (opts.showRole && p.role) name.textContent += ` — ${p.role}`;
    li.appendChild(name);

    // เป้าโหวตของตัวเอง (ไฮไลต์)
    if (opts.selectedUid === p.uid) li.classList.add("selected");

    // นับคะแนนโหวตเรียลไทม์ (เปิด เห็นทันที — ข้อ 3.3)
    if (opts.showCount) {
      const c = document.createElement("span");
      c.className = "count";
      c.textContent = `x${opts.countOf ? opts.countOf(p.uid) : 0}`;
      li.appendChild(c);
    }

    // กดเพื่อเลือก (เฉพาะที่ยังมีชีวิต)
    if (opts.selectable && p.alive === true && typeof opts.onTap === "function") {
      li.classList.add("selectable");
      li.addEventListener("click", () => opts.onTap(p.uid));
    }
    targetEl.appendChild(li);
  }
}

// ============================================================
// เฟสกลางวัน
// ============================================================
function renderDay() {
  $id("screen-day").classList.remove("hidden");

  // ปุ่ม "เริ่มโหวต" เฉพาะคนทรง
  $id("btn-start-vote").classList.toggle("hidden", !isHost());
  $id("btn-start-vote").onclick = () => {
    update(ref(db, `rooms/${roomCode}/meta`), { phase: "vote" });
  };

  renderPlayerList($id("day-players"), {
    selectable: false,
    showRole: myRole === "mayor" && (room.players[myUid] || {}).mayorRevealed
  });

  // Mayor เปิดตัวได้ในกลางวัน (ข้อ 4) — เฉพาะถ้าฉันเป็นนายกและยังไม่เปิดตัว
  const mayorBox = $id("mayor-box");
  const revealed = (room.players[myUid] || {}).mayorRevealed === true;
  if (myRole === "mayor" && !revealed) {
    mayorBox.innerHTML = "";
    const b = document.createElement("button");
    b.className = "btn gold";
    b.textContent = "เปิดตัวเป็นนายกเทศมนตรี 🏅 (โหวตหนัก 2 เสียง)";
    b.onclick = () => set(ref(db, `rooms/${roomCode}/players/${myUid}/mayorRevealed`), true);
    mayorBox.appendChild(b);
  } else if (revealed) {
    mayorBox.innerHTML = '<p class="hint">คุณคือนายกเทศมนตรี — โหวตของคุณนับเป็น 2 เสียง</p>';
  } else {
    mayorBox.innerHTML = "";
  }
}

// ============================================================
// เฟสโหวต
// ============================================================
function countVotesOf(uid) {
  if (!room || !room.players) return 0;
  let n = 0;
  for (const p of Object.values(room.players)) {
    if (p.alive === true && p.voteTarget === uid) {
      n += p.mayorRevealed === true ? 2 : 1; // Mayor = 2 เสียง
    }
  }
  return n;
}

function renderVote() {
  $id("screen-vote").classList.remove("hidden");

  const myVote = (room.players[myUid] || {}).voteTarget || null;
  selectedTarget = myVote; // ค่าเริ่มต้น = โหวตเดิมที่ส่งแล้ว (เปลี่ยนใจได้)

  renderPlayerList($id("vote-players"), {
    selectable: true,
    selectedUid: myVote,
    showCount: true,
    countOf: countVotesOf,
    onTap: (uid) => {
      // แตะซ้ำชื่อเดิม = ยกเลิกโหวต / แตะชื่ออื่น = เปลี่ยน (ข้อ 3.3)
      const target = selectedTarget === uid ? null : uid;
      selectedTarget = target;
      set(ref(db, `rooms/${roomCode}/players/${myUid}/voteTarget`), target);
      renderVote(); // re-render เปลี่ยน highlight
    }
  });

  // ปุ่มจัดการเฉพาะคนทรง
  const clearBtn = $id("btn-clear-vote");
  clearBtn.classList.toggle("hidden", !isHost());
  clearBtn.onclick = () => {
    const updates = {};
    for (const p of Object.values(room.players)) updates[`players/${p.uid}/voteTarget`] = null;
    update(ref(db, `rooms/${roomCode}`), updates);
  };

  $id("btn-end-vote").classList.toggle("hidden", !isHost());
  $id("btn-end-vote").onclick = () => finalizeVote();

  // สรุปโหวตสด (มองเห็นเรียลไทม์ — ข้อ 3.3)
  const sum = $id("vote-summary");
  const res = resolveVote(Object.values(room.players));
  if (res.totalVotes === 0) {
    sum.textContent = "ยังไม่มีเสียงโหวต";
  } else if (res.tie) {
    sum.textContent = `เสมอกันที่ ${res.max} เสียง → รอบนี้ไม่มีใครตาย`;
  } else {
    const target = room.players[res.votedOut];
    sum.textContent = `นำ ${res.max} เสียง → ${target ? target.name : "?"}`;
  }
}

// ------------------------------------------------------------
// finalizeVote() — (คนทรง) สรุปผล + ลงสถานะ + เช็กชนะ (ข้อ 5.2)
//   1. resolveVote → เห็นผลโหวต
//   2. applyVoteResult → ลง alive/revealed + Lovers ตายตาม + เช็กชนะ
//   3. ถ้าคนตายเป็น Hunter → เปิดสถานะ /hunter (ยิงทันทีในกลางวัน) → เฟส hunter
//   4. มีผู้ชนะ → meta.winner + เฟส end / ไม่มี → เข้ากลางคืน (เฟส night)
// ------------------------------------------------------------
function finalizeVote() {
  const playersData = Object.values(room.players).map((p) => ({ ...p }));

  // step 1 + 2
  const result = resolveVote(playersData);
  const out = applyVoteResult({
    players: playersData,
    lovers: (room.lovers && room.lovers.pair) || null,
    cursedStatuses: null,
    result,
    revealRole: (room.meta.settings && room.meta.settings.revealRoleOnDeath) !== false
  });

  // เตรียมชุดอัปเดตโฟลว์เดียว
  const updates = {};
  for (const uid of out.deaths) {
    updates[`players/${uid}/alive`] = false;
    const p = out.players.find((x) => x.uid === uid);
    if (p.revealed) updates[`players/${uid}/revealed`] = true;
  }

  // step 3: Hunter โดนโหวตตายกลางวัน → เปิดบทบาท + ยิงทันที (ข้อ 3.4/4)
  if (out.hunterTrigger) {
    updates["hunter"] = hunterDie(out.hunterTrigger.uid, "day");
    updates["meta/phase"] = "hunter";
  } else if (out.winner && out.winner.winner) {
    // step 4: จบเกม
    updates["meta/winner"] = out.winner.winner;
    updates["meta/phase"] = "end";
  } else {
    // เข้าสู่กลางคืน
    updates["meta/phase"] = "night";
  }

  update(ref(db, `rooms/${roomCode}`), updates);
}

// ============================================================
// เฟสนายพราน
// ============================================================
function renderHunter() {
  $id("screen-hunter").classList.remove("hidden");

  const hunter = room.hunter || {};
  const isMe = hunter.uid === myUid;
  const msg = $id("hunter-msg");
  const list = $id("hunter-players");
  const shootBtn = $id("btn-shoot");

  // นายพรานที่ต้องยิง = ตัวฉัน + ยังไม่ยิง
  if (isMe && hunter.canShoot && !hunter.shot) {
    msg.textContent = hunter.shootNow
      ? "คุณโดนโหวตตายกลางวัน → ยิงได้ทันที เลือก 1 คน"
      : "คุณตายกลางคืน → เช้านี้ยิงได้ 1 คน";
    selectedTarget = selectedTarget || null;

    renderPlayerList(list, {
      selectable: true,
      selectedUid: selectedTarget,
      onTap: (uid) => {
        selectedTarget = uid;
        renderHunter();
      }
    });

    shootBtn.classList.remove("hidden");
    shootBtn.disabled = !selectedTarget;
    shootBtn.onclick = () => submitHunterShot(selectedTarget);
  } else {
    // คนอื่น/ยิงเสร็จแล้ว → เห็นสถานะเท่านั้น
    msg.textContent = hunter.uid
      ? (hunter.shot ? "นายพรานยิงเสร็จแล้ว 🏹" : "นายพรานกำลังเลือกเป้า…")
      : "ไม่มีนายพรานในเกมนี้";
    list.innerHTML = "";
    shootBtn.classList.add("hidden");
  }
}

// ------------------------------------------------------------
// submitHunterShot(target) — ยิงจริง (เรียก hunter.js)
//   พอคนทรงกดสรุป ให้ระบบเรียก applyHunterShot แล้วลงผล
// ------------------------------------------------------------
function submitHunterShot(target) {
  const hunter = room.hunter;
  const playersData = Object.values(room.players).map((p) => ({ ...p }));

  const out = applyHunterShot({
    players: playersData,
    lovers: (room.lovers && room.lovers.pair) || null,
    cursedStatuses: null,
    hunterState: hunter,
    target
  });

  if (!out.ok) {
    $id("hunter-msg").textContent = out.reason;
    return;
  }

  // ลงผลผู้ตาย + สถานะ hunter (shot=true) + เช็กชนะ
  const updates = {};
  for (const uid of out.deaths) {
    updates[`players/${uid}/alive`] = false;
    const p = out.players.find((x) => x.uid === uid);
    if (p.revealed) updates[`players/${uid}/revealed`] = true;
  }
  updates["hunter"] = out.hunterFinal;

  if (out.winner && out.winner.winner) {
    updates["meta/winner"] = out.winner.winner;
    updates["meta/phase"] = "end";
  } else {
    updates["meta/phase"] = "night"; // ผ่านมิดดนายแล้วเข้ากลางคืน
  }

  update(ref(db, `rooms/${roomCode}`), updates);
}

// ============================================================
// init() — ล็อกอิน + subscribe ข้อมูลห้อง + บทบาทตัวเอง
// ============================================================
async function init() {
  roomCode = getQueryParam("room");
  if (!roomCode) {
    document.body.innerHTML = "<p class='hint'>ไม่พบรหัสห้อง (หน้านี้ต้องเปิดผ่าน ?room=XXXX)</p>";
    return;
  }

  const auth = getAuth();
  signInAnonymously(auth).catch((e) => console.error("Login fail:", e));

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    myUid = user.uid;
    console.log("uid:", myUid);

    // ฟังทั้งห้อง
    onValue(ref(db, `rooms/${roomCode}`), (snap) => {
      room = snap.val();
      render();
    });

    // ฟังเฉพาะบทบาทตัวเอง (ไม่อ่านของคนอื่น — ตาม Security Rules ข้อ 9)
    onValue(ref(db, `rooms/${roomCode}/secret/roles/${myUid}`), (snap) => {
      const r = snap.val();
      myRole = r ? r.role : null;
      if (myRole) render();
    });
  });
}

init();