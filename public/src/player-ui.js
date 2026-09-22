// ============================================================
// player-ui.js — หน้าผู้เล่น: บัตรบทบาท / กลางวัน / โหวต / กลางคืน / นายพราน
// อ้างอิงแผนข้อ 6 (หน้ากลางวัน+โหวต+กลางคืน), 3.1 (เรียกบทบาท), 3.2 (หมาป่าโหวต),
// 3.3 / 3.4 / 3.8 (timer) / 4 (กติกาบทบาท) / 8 (schema)
// หลักการ: logic อยู่ที่ night.js / vote.js / hunter.js / roles.js
//          ไฟล์นี้เป็นเพียงตัว render + ผูก Firebase เท่านั้น
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, onValue, set, update } from "firebase/database";
import { applyVoteResult, resolveVote } from "./vote.js";
import { applyHunterShot, hunterDie } from "./hunter.js";
import { normalizePlayers } from "./room-utils.js";
import { ROLE, getTeam } from "./roles.js";
import { ACTIONS, submitNightAction } from "./night.js";

// ตัวแปรสถานะกลาง (global ภายในไฟล์นี้)
let roomCode = null;            // รหัสห้องจาก URL ?room=XXXX
let myUid = null;               // uid ของตัวเอง (มาจาก Firebase Auth)
let room = null;                // สแนปช็อตทั้งโหนด /rooms/{code}/meta
let myRole = null;              // role id ของตัวเอง (จาก /secret/roles)
let mySecret = null;            // { role, team } ของตัวเอง
let myCursed = null;            // สถานะ Cursed ของตัวเอง (secret/cursed/{uid})
let myNightAction = null;       // action กลางคืนของตัวเอง (night/actions/{uid})
let wolfMembers = {};           // { [uid]: true } ทีมหมาป่า (wolf/members)
let myWolfVotes = {};           // { [wolfUid]: targetUid } โหวตของทีม (ไลฟ์)
let selectedTarget = null;      // เป้าที่กำลังเลือก (โหวต/ยิง) ยังไม่ยืนยัน
let wolvesBound = false;
let wolfVoteSubscribed = new Set();
let timerInterval = null;

// แมปชื่อเฟส → ภาษาไทย (ใช้แสดงเท่านั้น ไม่ส่งผลกับ logic)
const PHASE_TH = {
  lobby: "ล็อบบี้",
  night: "กลางคืน",
  day: "กลางวัน",
  vote: "โหวต",
  hunter: "นายพราน",
  end: "จบเกม"
};

// ฟิลด์หมดเวลาใน meta (ข้อ 3.8) — host เขียน meta.timerXEndAt
const TIMER_FIELD = {
  night: "timerNightEndAt",
  day: "timerDayEndAt",
  vote: "timerVoteEndAt"
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
// alivePlayers(opts) — รายชื่อผู้เล่นที่ยังมีชีวิต (เรียงตาม joinedAt)
//   excludeSelf = true → ตัดตัวเองออก
// ------------------------------------------------------------
function alivePlayers(excludeSelf = false) {
  if (!room || !room.players) return [];
  return Object.values(room.players)
    .filter((p) => p.alive === true && (!excludeSelf || p.uid !== myUid))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

function playerNameOf(uid) {
  const p = room && room.players && room.players[uid];
  return p ? p.name || "(?)" : "(?)";
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
// ตัวจับเวลา (แผนข้อ 3.8) — นับถอยหลังจาก meta.timerXEndAt
// ------------------------------------------------------------
function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer(elId) {
  clearTimer();
  const endAt = (room.meta || {})[TIMER_FIELD[room.meta.phase]] || 0;
  const el = $id(elId);
  if (!el) return;
  if (!endAt) {
    el.textContent = "";
    return;
  }
  const tick = () => {
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    el.textContent = left > 0 ? `⏳ เหลือ ${left} วิ` : "⏳ หมดเวลาแล้ว";
    if (left <= 0) clearTimer();
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

// ------------------------------------------------------------
// phaseEndAt(phase) — เวลาจบเฟส ตาม settings.timers (แผนข้อ 3.8)
// ------------------------------------------------------------
function phaseEndAt(phase) {
  const timers = (room.meta && room.meta.settings && room.meta.settings.timers) || {};
  const sec = Number(timers[phase]);
  return Date.now() + (Number.isFinite(sec) && sec > 0 ? sec : 30) * 1000;
}

// ------------------------------------------------------------
// renderRoleCard() — บัตรบทบาทตัวเอง (เห็นตลอด ทุกเฟส)
// ------------------------------------------------------------
function renderRoleCard() {
  if (!myRole) return;
  const role = ROLE[myRole];
  if (!role) return;
  $id("role-card").classList.remove("hidden");
  $id("role-icon").src = role.iconPath;
  $id("role-icon").alt = role.nameTH;
  const team = getTeam(myRole);
  const teamLabels = { village: "ฝ่ายชาวบ้าน 🏘️", wolf: "ฝ่ายหมาป่า 🐺", neutral: "เป็นกลาง ⚖️" };
  const teamEl = $id("role-team");
  teamEl.textContent = teamLabels[team] || team;
  teamEl.className = `role-team team-${team}`;
  $id("role-name").innerHTML = `${role.nameTH} <em>${role.nameEN}</em>`;
  $id("role-desc").textContent = role.description;
}

// ------------------------------------------------------------
// render() — ตัวกระจาย: แสดงเฟสที่ถูกต้องตาม meta.phase
// ------------------------------------------------------------
function render() {
  if (!room || !room.meta || !myUid) return;
  renderTopbar();
  renderRoleCard();

  const phase = room.meta.phase;
  const me = room.players[myUid];

  // ตายแล้ว → ส่งไปหน้า spectator (แผนข้อ 3.4) — ยกเว้นนายพรานที่ตายต้องยิงคืนนี้
  if (me && me.alive === false && phase !== "end") {
    const hunterTurn = phase === "hunter" && myRole === "hunter" &&
      room.hunter && room.hunter.uid === myUid && room.hunter.canShoot && !room.hunter.shot;
    if (!hunterTurn) {
      window.location.href = `host.html?room=${roomCode}`;
      return;
    }
  }

  // ซ่อนหน้าจอทั้งหมดก่อน แล้วค่อยเปิดเฉพาะเฟส
  ["day", "vote", "hunter", "night", "end"].forEach((s) => $id(`screen-${s}`).classList.add("hidden"));

  switch (phase) {
    case "day": return renderDay();
    case "vote": return renderVote();
    case "hunter": return renderHunter();
    case "night": return renderNight();
    case "end": return renderEnd();
    default: {
      clearTimer();
      $id("screen-night").classList.remove("hidden");
    }
  }
}

// ------------------------------------------------------------
// renderEnd() — แสดงผลผู้ชนะ ตาม /meta/winner
// ------------------------------------------------------------
function renderEnd() {
  clearTimer();
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
  updateTimer("day-timer");

  // ปุ่ม "เริ่มโหวต" เฉพาะคนทรง
  $id("btn-start-vote").classList.toggle("hidden", !isHost());
  $id("btn-start-vote").onclick = () => {
    update(ref(db, `rooms/${roomCode}/meta`), { phase: "vote", timerVoteEndAt: phaseEndAt("vote") });
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
  updateTimer("vote-timer");

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
// ------------------------------------------------------------
function finalizeVote() {
  const playersData = Object.values(room.players).map((p) => ({ ...p }));
  const result = resolveVote(playersData);
  const out = applyVoteResult({
    players: playersData,
    lovers: (room.lovers && room.lovers.pair) || null,
    cursedStatuses: null,
    result,
    revealRole: (room.meta.settings && room.meta.settings.revealRoleOnDeath) !== false
  });

  const updates = {};
  for (const uid of out.deaths) {
    updates[`players/${uid}/alive`] = false;
    const p = out.players.find((x) => x.uid === uid);
    if (p.revealed) updates[`players/${uid}/revealed`] = true;
  }

  if (out.hunterTrigger) {
    updates["hunter"] = hunterDie(out.hunterTrigger.uid, "day");
    updates["meta/phase"] = "hunter";
  } else if (out.winner && out.winner.winner) {
    updates["meta/winner"] = out.winner.winner;
    updates["meta/phase"] = "end";
  } else {
    updates["meta/phase"] = "night";
    updates["meta/hostCall"] = null;
    updates["meta/timerNightEndAt"] = phaseEndAt("night");
  }

  update(ref(db, `rooms/${roomCode}`), updates);
}

// ============================================================
// เฟสนายพราน
// ============================================================
function renderHunter() {
  clearTimer();
  $id("screen-hunter").classList.remove("hidden");

  const hunter = room.hunter || {};
  const isMe = hunter.uid === myUid;
  const msg = $id("hunter-msg");
  const list = $id("hunter-players");
  const shootBtn = $id("btn-shoot");

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
    msg.textContent = hunter.uid
      ? (hunter.shot ? "นายพรานยิงเสร็จแล้ว 🏹" : "นายพรานกำลังเลือกเป้า…")
      : "ไม่มีนายพรานในเกมนี้";
    list.innerHTML = "";
    shootBtn.classList.add("hidden");
  }
}

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
    updates["meta/phase"] = "night";
    updates["meta/hostCall"] = null;
    updates["meta/timerNightEndAt"] = phaseEndAt("night");
  }

  update(ref(db, `rooms/${roomCode}`), updates);
}

// ============================================================
// เฟสกลางคืน — host เรียกทีละบทบาท (ข้อ 3.1) — ผู้เล่นตอบ action
// ============================================================

// บทบาทที่ร่วมโหวตเหยื่อ (ข้อ 3.2 + ข้อ 4) — ตรงกับ night.js WOLF_VOTER_ROLES
const WOLF_VOTERS = ["werewolf", "wolfCub", "sorceress"];

function isWolfTeamMember() {
  return !!(mySecret && mySecret.team === "wolf");
}

// เราโหวตเหยื่อได้ไหม (รวม Cursed ที่ถูกกัดแล้ว — ข้อ 4)
function canVoteWolfTarget() {
  if (WOLF_VOTERS.includes(myRole)) return true;
  return myRole === "cursed" && myCursed && myCursed.status === "turned";
}

function renderNight() {
  $id("screen-night").classList.remove("hidden");
  updateTimer("night-timer");

  const statusEl = $id("night-status");
  const altEl = $id("night-status-alt");
  const formEl = $id("night-form");
  const doneEl = $id("night-done");
  const masonEl = $id("mason-visible");
  formEl.innerHTML = "";
  altEl.textContent = "";
  masonEl.textContent = "";
  doneEl.classList.add("hidden");

  if (!myRole) {
    statusEl.textContent = "กำลังโหลดบทบาทของคุณ…";
    return;
  }

  const call = (room.meta && room.meta.hostCall) || null;
  const myRoleMeta = ROLE[myRole] || null;
  const roleNameTh = (id) => (ROLE[id] ? ROLE[id].nameTH : id);

  // Mason: ไม่ได้ถูกเรียกแบบ action แต่เผื่อจำนวนให้เห็นคู่เมสันผ่าน host เรียก
  if (myRole === "mason") {
    masonEl.textContent = "🧱 คุณคือ Mason — host จะเรียกให้ลืมตาเห็นคู่ Mason (ฝ่ายดีด้วยกัน) — ไม่ต้องตอบ action";
  }

  // ============ เรียกหมาป่า: ทีมที่โหวตเหยื่อได้ (ข้อ 3.2) ============
  if (call === "wolf") {
    if (canVoteWolfTarget()) {
      buildWolfVoteForm();
    } else if (myRole === "minion") {
      statusEl.textContent = "🐺 host เรียกหมาป่า — คุณคือสมุน รู้ว่าหมาป่าเป็นใครแต่ไม่ร่วมเลือกเหยื่อ (ปิดตาได้)";
    } else {
      statusEl.textContent = "🐺 host กำลังเรียกหมาป่า — ไม่ใช่ตาเรา (ปิดตาได้)";
    }
    return;
  }

  // ============ เรียกผู้ต้องสาป (เรียกทุกคืน ข้อ 3.1/4) ============
  if (call === "cursed") {
    if (myRole === "cursed") {
      if (myCursed && myCursed.status === "turned") {
        statusEl.textContent = "🐺 host เรียก Cursed — คุณกลายเป็นหมาป่าแล้ว! host จะชี้ให้เห็นหมาป่าคนอื่น (ไม่ต้องตอบ action ที่นี่)";
      } else {
        statusEl.textContent = "🏘️ host เรียก Cursed — ยังเป็นชาวบ้าน (host แจ้งให้ทราบด้วยปากเปล่า)";
      }
    } else {
      statusEl.textContent = "🕰️ host กำลังเรียกผู้ต้องสาป — ไม่ใช่ตาเรา (ปิดตาได้)";
    }
    return;
  }

  // ============ เรียกบทบาทตัวเองที่มี action ============
  const myStepRole = call ? STEP_TO_ROLE[call] : null;
  if (call && myStepRole === myRole) {
    buildMyActionForm(myRoleMeta);
    return;
  }

  // ยังไม่ถึงตาเรา / host ยังไม่เรียก
  statusEl.textContent = call
    ? `🕰️ host กำลังเรียก ${myStepRole ? roleNameTh(myStepRole) : call === "wolf" ? "หมาป่า" : call} — ยังไม่ถึงตาเรา (ปิดตาได้)`
    : "🌙 หลับตา… รอคนทรงเรียกบทบาทของคุณ";
}

// ------------------------------------------------------------
// helper: สร้าง <select> ผู้เล่นที่ยังมีชีวิต
// ------------------------------------------------------------
function makePlayerSelect(players, excludeUidList = [], placeholder = "— เลือกผู้เล่น —", selectedValue = "") {
  const sel = document.createElement("select");
  sel.className = "input";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  sel.appendChild(ph);
  for (const p of players) {
    if (excludeUidList.includes(p.uid)) continue;
    const opt = document.createElement("option");
    opt.value = p.uid;
    opt.textContent = p.name || "(?)";
    sel.appendChild(opt);
  }
  sel.value = selectedValue;
  return sel;
}

function addConfirmButton(formEl, label, onClick) {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "ส่งแล้ว...";
    await onClick(btn);
  });
  formEl.appendChild(btn);
  return btn;
}

// แปลง hostCall (ค่า step ใน getNightOrder) → role id จริง (ข้อ 3.1)
const STEP_TO_ROLE = {
  cupid: "cupid",
  seer: "seer",
  aura: "auraSeer",
  doctor: "doctor",
  bodyguard: "bodyguard",
  witch_heal: "witch",
  sorceress: "sorceress"
};

// ------------------------------------------------------------
// buildMyActionForm(roleMeta) — ฟอร์ม action กลางคืนของฉัน (ข้อ 4)
// เขียนไป /night/actions/{myUid} (rules อนุญาต self-write)
// ------------------------------------------------------------
function buildMyActionForm(roleMeta) {
  const statusEl = $id("night-status");
  const altEl = $id("night-status-alt");
  const formEl = $id("night-form");

  // ส่งไปแล้วในคืนนี้ → ไม่ให้ฟอร์มเด้งซ้ำ (host ล้าง action ตอนเช้า ข้อ 8)
  if (myNightAction && myNightAction.used) {
    statusEl.textContent = "✅ ส่ง action แล้ว — ปิดตาได้" + roleLabelDone(myRole);
    return;
  }

  const state = {
    players: Object.values(room.players).map((p) => ({ ...p })),
    currentNight: (room.meta && room.meta.day) || 1
    // หมายเหตุ: บอดี้การ์ดใช้ self-track (players/{uid}/lastProtected) — wolf zone อ่านไม่ได้
  };
  const reportError = (reason) => {
    altEl.textContent = "⚠️ " + reason;
  };

  if (myRole === "seer" || myRole === "auraSeer" || myRole === "sorceress") {
    statusEl.textContent = myRole === "seer"
      ? "🔮 คุณคือผู้หยั่งรู้ — ตรวจผู้เล่น 1 คน ว่าเป็นหมาป่าหรือไม่"
      : myRole === "auraSeer"
        ? "🌟 คุณคือผู้หยั่งรู้ออร่า — ตรวจว่าเป็นบทบาทอะไร"
        : "🔮 แม่มดหมาป่า — ตรวจผู้เล่น 1 คนว่าเป็น Seer ใช่หรือไม่";
    const type = myRole === "seer" ? ACTIONS.SEER : myRole === "auraSeer" ? ACTIONS.AURA : ACTIONS.SORCERESS;
    const sel = makePlayerSelect(alivePlayers(true));
    formEl.appendChild(sel);
    addConfirmButton(formEl, "ยืนยันตรวจ", async (btn) => {
      const res = submitNightAction(state, myUid, type, sel.value);
      if (!res.ok) { btn.disabled = false; btn.textContent = "ยืนยันตรวจ"; return reportError(res.reason); }
      await set(ref(db, `rooms/${roomCode}/night/actions/${myUid}`), res.action);
    });
    return;
  }

  if (myRole === "doctor" || myRole === "bodyguard") {
    const exclude = myRole === "doctor" ? [myUid] : [];
    // บอดี้การ์ดจำเป้าตัวเองไว้ที่ players/{uid}/lastProtected (เขียนเอง self-write — อ่านได้สาธารณะ)
    // ใช้แทน wolf/lastBodyguardTarget เพราะ rules อนุญาตเฉพาะทีมหมาป่า+host เท่านั้น
    const prevBg = (myRole === "bodyguard" && room.players[myUid] && room.players[myUid].lastProtected) || null;
    statusEl.textContent = myRole === "doctor"
      ? "💉 คุณคือหมอ — เลือกคนที่ปกป้องคืนนี้ (ห้ามเป็นตัวเอง)"
      : "🛡️ คุณคือบอดี้การ์ด — เลือกคนที่ปกป้องคืนนี้ (กันตัวเองได้)";
    const players = alivePlayers();
    if (prevBg && players.find((p) => p.uid === prevBg && p.alive)) {
      altEl.textContent = `⚠️ ห้ามเลือกคนเดิมซ้ำ: ${playerNameOf(prevBg)} (จากคืนก่อน)`;
      exclude.push(prevBg);
    }
    const type = myRole === "doctor" ? ACTIONS.DOCTOR : ACTIONS.BODYGUARD;
    const sel = makePlayerSelect(players, exclude);
    formEl.appendChild(sel);
    addConfirmButton(formEl, "ยืนยันปกป้อง", async (btn) => {
      const res = submitNightAction(state, myUid, type, sel.value);
      if (!res.ok) { btn.disabled = false; btn.textContent = "ยืนยันปกป้อง"; return reportError(res.reason); }
      const writes = {};
      writes[`night/actions/${myUid}`] = res.action;
      if (myRole === "bodyguard") writes[`players/${myUid}/lastProtected`] = sel.value;
      await update(ref(db, `rooms/${roomCode}`), writes);
    });
    return;
  }

  if (myRole === "witch") {
    renderWitchForm(state);
    return;
  }

  if (myRole === "cupid") {
    const isNight1 = state.currentNight === 1;
    if (!isNight1) {
      statusEl.textContent = "💘 คิวปิดเลือกคู่รักได้แค่คืนแรก — คืนนี้ปิดตาได้";
      return;
    }
    statusEl.textContent = "💘 คุณคือคิวปิด — เลือกคู่รัก 2 คน (คืนแรก ใช้ครั้งเดียว)";
    const players = alivePlayers(true);
    const selA = makePlayerSelect(players, [], "เลือกคนที่ 1…");
    const selB = makePlayerSelect(players, [], "เลือกคนที่ 2…");
    formEl.appendChild(selA);
    formEl.appendChild(selB);
    addConfirmButton(formEl, "ยืนยันคู่รัก", async (btn) => {
      if (!selA.value || !selB.value) {
        btn.disabled = false; btn.textContent = "ยืนยันคู่รัก"; return reportError("ต้องเลือกคู่รักให้ครบ 2 คน");
      }
      const res = submitNightAction(state, myUid, ACTIONS.CUPID, [selA.value, selB.value]);
      if (!res.ok) { btn.disabled = false; btn.textContent = "ยืนยันคู่รัก"; return reportError(res.reason); }
      await set(ref(db, `rooms/${roomCode}/night/actions/${myUid}`), res.action);
    });
    return;
  }

  // บทบาทที่ไม่มี action ตอนกลางคืน
  statusEl.textContent = `🌙 host เรียก ${roleMeta ? roleMeta.nameTH : myRole} — บทบาทนี้ไม่มี action กลางคืน (ปิดตาได้)`;
}

function roleLabelDone(roleId) {
  const map = {
    seer: " — รอ host ประกาศผลตรวจเช้า",
    auraSeer: " — รอ host ประกาศผลตรวจเช้า",
    sorceress: " — รอ host ประกาศผลตรวจเช้า",
    cupid: "",
    witch: ""
  };
  return map[roleId] || "";
}

// ------------------------------------------------------------
// renderWitchForm(state) — แม่มด: ยารักษา/ยาพิษ อย่างละครั้งเดียว (ข้อ 4)
// ------------------------------------------------------------
function renderWitchForm(state) {
  const statusEl = $id("night-status");
  const altEl = $id("night-status-alt");
  const formEl = $id("night-form");

  const saveUsed = (room.meta && room.meta.witchSaveUsed) === true;
  const poisonUsed = (room.meta && room.meta.witchPoisonUsed) === true;

  if (saveUsed && poisonUsed) {
    statusEl.textContent = "🧪 คุณคือแม่มด — ใช้ยาหมดแล้วทั้ง 2 ชนิด (ปิดตาได้)";
    return;
  }

  statusEl.textContent = "🧪 คุณคือแม่มด — เลือกยาที่จะใช้คืนนี้ (อย่างละครั้งเดียวทั้งเกม)";
  const typeSel = document.createElement("select");
  typeSel.className = "input";
  const optSave = document.createElement("option");
  optSave.value = ACTIONS.WITCH_HEAL;
  optSave.textContent = saveUsed ? "ยารักษา (ใช้แล้ว)" : "💊 ยารักษา — กันหมาป่าฆ่า (ใช้กับตัวเองได้)";
  const optPoison = document.createElement("option");
  optPoison.value = ACTIONS.WITCH_POISON;
  optPoison.textContent = poisonUsed ? "ยาพิษ (ใช้แล้ว)" : "☠️ ยาพิษ — ฆ่าเป้าหมาย 1 คน";
  typeSel.appendChild(optSave);
  typeSel.appendChild(optPoison);
  if (saveUsed) typeSel.value = ACTIONS.WITCH_POISON;
  if (poisonUsed) typeSel.value = ACTIONS.WITCH_HEAL;

  const targetSel = makePlayerSelect(alivePlayers(), [], "เลือกเป้าหมาย…");
  formEl.appendChild(typeSel);
  formEl.appendChild(targetSel);
  addConfirmButton(formEl, "ยืนยันใช้ยา", async (btn) => {
    const res = submitNightAction(state, myUid, typeSel.value, targetSel.value);
    if (!res.ok) { btn.disabled = false; btn.textContent = "ยืนยันใช้ยา"; return altEl.textContent = "⚠️ " + res.reason; }
    await set(ref(db, `rooms/${roomCode}/night/actions/${myUid}`), res.action);
  });
}

// ------------------------------------------------------------
// buildWolfVoteForm() — โหวตเหยื่อของหมาป่า (ข้อ 3.2)
// เขียน /wolf/votes/{myUid} (rules อนุญาต self-write) เปลี่ยนใจได้จน host สรุป
// ------------------------------------------------------------
function buildWolfVoteForm() {
  const statusEl = $id("night-status");
  const altEl = $id("night-status-alt");
  const formEl = $id("night-form");

  const teammates = Object.keys(wolfMembers || {});
  if (isWolfTeamMember() && teammates.length) {
    altEl.textContent = `🐺 ทีมของเรา: ${teammates.map((u) => playerNameOf(u)).join(", ")} (เห็นกัน ไม่มีแชท)`;
  } else if (myRole === "cursed") {
    altEl.textContent = "🐺 host จะชี้ให้รู้จักหมาป่าคนอื่นด้วยปากเปล่า (คุณกลายเป็นหมาป่าแล้ว)";
  }

  statusEl.textContent = "🐺 host เรียกหมาป่า — เลือกเหยื่อร่วมกัน (เสียงข้างมากชนะ)";

  // โหวตไลฟ์ของทีม (เห็นกัน เปลี่ยนใจได้ — ข้อ 3.2)
  const live = Object.entries(myWolfVotes).filter(([, t]) => t);
  const liveEl = document.createElement("p");
  liveEl.className = "hint";
  liveEl.textContent = live.length
    ? "โหวตตอนนี้: " + live.map(([v, t]) => `${playerNameOf(v)}→${t === myUid ? "ฉัน" : playerNameOf(t)}`).join(" · ")
    : "ยังไม่มีใครโหวตในทีม";
  formEl.appendChild(liveEl);

  const myCurrent = myWolfVotes[myUid] || "";
  const sel = makePlayerSelect(alivePlayers(true), [], "— เลือกเหยื่อ —", myCurrent);
  formEl.appendChild(sel);
  addConfirmButton(formEl, "ยืนยันเลือกเหยื่อ", async (btn) => {
    if (!sel.value) { btn.disabled = false; btn.textContent = "ยืนยันเลือกเหยื่อ"; return; }
    await set(ref(db, `rooms/${roomCode}/wolf/votes/${myUid}`), sel.value);
  });
}

// ------------------------------------------------------------
// bindWolves() — subscribe ข้อมูลทีมหมาป่า (อ่านได้เฉพาะทีม wolf — rules)
// ------------------------------------------------------------
function bindWolves() {
  if (wolvesBound || !myUid) return;
  wolvesBound = true;
  onValue(ref(db, `rooms/${roomCode}/wolf/members`), (snap) => {
    wolfMembers = snap.val() || {};
    for (const muid of Object.keys(wolfMembers)) {
      if (wolfVoteSubscribed.has(muid)) continue;
      wolfVoteSubscribed.add(muid);
      onValue(ref(db, `rooms/${roomCode}/wolf/votes/${muid}`), (s) => {
        const v = s.val();
        if (v) myWolfVotes[muid] = v;
        else delete myWolfVotes[muid];
        render();
      });
    }
    render();
  });
}

// ------------------------------------------------------------
// init() — ล็อกอิน + subscribe ข้อมูลห้อง + บทบาทตัวเอง
// ------------------------------------------------------------
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

    // อ่านแบบแยก node (Security Rules: ห้าม read ทั้งห้อง — ไม่งั้น secret รั่ว)
    room = { meta: null, players: {} };
    onValue(ref(db, `rooms/${roomCode}/meta`), (snap) => {
      room.meta = snap.val();
      render();
    });
    onValue(ref(db, `rooms/${roomCode}/players`), (snap) => {
      // normalize: key ของ /players/{uid} คือ identity → ใส่ uid จาก key ให้ object ด้วย
      room.players = Object.fromEntries(
        normalizePlayers(snap.val() || {}).map((p) => [p.uid, p])
      );
      render();
    });
    onValue(ref(db, `rooms/${roomCode}/hunter`), (snap) => {
      room.hunter = snap.val() || null;
      render();
    });
    onValue(ref(db, `rooms/${roomCode}/lovers`), (snap) => {
      room.lovers = snap.val() || null;
      render();
    });

    // บทบาทตัวเอง (ไม่อ่านของคนอื่น — ตาม Security Rules ข้อ 9)
    onValue(ref(db, `rooms/${roomCode}/secret/roles/${myUid}`), (snap) => {
      mySecret = snap.val() || null;
      myRole = mySecret ? mySecret.role : null;
      if (isWolfTeamMember()) bindWolves();
      render();
    });

    // สถานะ Cursed ของตัวเอง (rules อนุญาต self-read)
    onValue(ref(db, `rooms/${roomCode}/secret/cursed/${myUid}`), (snap) => {
      myCursed = snap.val() || null;
      render();
    });

    // action กลางคืนของตัวเอง (rules อนุญาต self-read)
    onValue(ref(db, `rooms/${roomCode}/night/actions/${myUid}`), (snap) => {
      myNightAction = snap.val() || null;
      render();
    });
  });
}

init();