// ============================================================
// host-ui.js — หน้าคนทรง (Moderator) + โหมดผู้ชม (อ่านอย่างเดียว)
// อ้างอิงแผนข้อ 3.1 (เรียกบทบาทกลางคืน), 3.2 (โหวตหมาป่าไลฟ์),
// 3.6 (คนทรงหลุด/transfer), 4 (Cursed), 5.2 (เช็กชนะ), 6 (spectator), 8 (schema)
//
// starter ที่เขียน @ background (Day 6-7):
//   - ปุ่มควบคุมเฟส: lobby→night→day→vote→(hunter)→night
//   - "สรุปกลางคืน" เรียก resolveNight + ลงผล + เช็กชนะ (night.js)
//   - "สรุปโหวต" จำลอง finalizeVote เดียวกับ player-ui (vote.js)
//   - แผงโหวตหมาป่าไลฟ์ + สถานะ Cursed + สลับคนทรง (host-control.js)
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, onValue, update, set } from "firebase/database";
import { resolveNight } from "./night.js";
import { getNightOrder, markCursedTurned, hostTransfer, hostTakeOver } from "./host-control.js";
import { resolveVote, applyVoteResult } from "./vote.js";
import { hunterDie } from "./hunter.js";
import { checkWin } from "./win-check.js";
import { normalizePlayers } from "./room-utils.js";

let roomCode = null;
let room = null;
let myUid = null;

const $id = (n) => document.getElementById(n);

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const PHASE_TH = {
  lobby: "ล็อบบี้ 🛋️",
  night: "กลางคืน 🌙",
  day: "กลางวัน ☀️",
  vote: "โหวต 🗳️",
  hunter: "นายพราน 🏹",
  end: "จบเกม 🏁"
};

const WINNER_TH = {
  villagers: "ชาวบ้านชนะ! 🎉",
  wolves: "หมาป่าชนะ! 🐺",
  lovers: "คู่รักชนะ! 💞",
  fool: "คนโง่ชนะเดี่ยว! 🤡"
};

function isHost() {
  const meta = room && room.meta;
  return !!meta && (meta.hostUid === myUid || meta.hostUid2 === myUid);
}

function alivePlayers() {
  if (!room || !room.players) return [];
  return Object.values(room.players).filter((p) => p.alive === true);
}

function playerName(uid) {
  const p = room && room.players && room.players[uid];
  return p ? p.name || "(?)" : "(?)";
}

// ------------------------------------------------------------
// renderTopbar() ชื่อเฟส + วัน
// ------------------------------------------------------------
function renderTopbar() {
  $id("room-code").textContent = roomCode;
  $id("day-label").textContent = `วัน ${(room && room.meta && room.meta.day) || 0}`;
  $id("phase-label").textContent = PHASE_TH[(room && room.meta && room.meta.phase) || "lobby"];
}

// ------------------------------------------------------------
// logHost(msg) — ข้อความบันทึกในแผงคนทรง
// ------------------------------------------------------------
function logHost(msg) {
  const log = $id("host-log");
  log.textContent = `${new Date().toLocaleTimeString("th-TH")} ${msg}\n${log.textContent}`;
}

// ------------------------------------------------------------
// buildRoomState() — รวมข้อมูลห้องให้ resolveNight (ข้อ 8)
// ------------------------------------------------------------
function buildRoomState() {
  return {
    players: Object.values(room.players || {}).map((p) => ({ ...p })),
    currentNight: (room.meta && room.meta.day) || 1,
    actions: (room.night && room.night.actions) || {},
    wolfVotes: (room.wolf && room.wolf.votes) || {},
    lovers: (room.lovers && room.lovers.pair) || null,
    cursedStatuses: (room.secret && room.secret.cursed) || {},
    prevBodyguardTarget: (room.wolf && room.wolf.lastBodyguardTarget) || null,
    wolfDoubleKill: (room.wolf && room.wolf.doubleKill) === true,
    wolfSickPrev: (room.wolf && room.wolf.sickNext) === true
  };
}

// ============================================================
// เฟสคอนโทร (คนทรงกดทีละปุ่ม)
// ============================================================

// เริ่มเกม / ล็อบบี้ → กลางคืน 1
function startNight() {
  if (!isHost()) return;
  update(ref(db, `rooms/${roomCode}/meta`), { phase: "night", day: 1, winner: null });
  logHost("เริ่มกลางคืน 1 🌙");
}

// เช้า: สรุปกลางคืน → resolveNight + ลงผล + เช็กชนะ
function resolveNightHost() {
  if (!isHost() || !room || room.meta.phase !== "night") return;

  const out = resolveNight(buildRoomState());
  const updates = {};

  for (const p of out.players) {
    updates[`players/${p.uid}/alive`] = p.alive;
    if (p.revealed) updates[`players/${p.uid}/revealed`] = true;
  }

  // คู่รัก (cupid คืนแรก) + สถานะ Cursed
  if (out.lovers && out.lovers.length === 2) updates["lovers/pair"] = out.lovers;
  updates["secret/cursed"] = out.cursedStatuses;

  // หมาป่า: ไม่ให้ทำซ้ำคืนถัดไป (doubleKill/sickNext/รู้จัก Cursed) + จำเป้าบอดี้การ์ด
  updates["wolf/doubleKill"] = out.wolf.doubleKill || false;
  updates["wolf/sickNext"] = out.wolf.sickNext || false;
  updates["wolf/knowsCursed"] = out.wolf.knowsCursed || false;
  updates["wolf/lastBodyguardTarget"] = out.nextBodyguardTarget || null;

  // ผู้ชนะ?
  const winner = checkWin(out.players, out.lovers, out.cursedStatuses, null);
  if (winner && winner.winner) {
    updates["meta/winner"] = winner.winner;
    updates["meta/phase"] = "end";
  } else if (out.hunterTriggers && out.hunterTriggers.length) {
    // นายพรานตายกลางคืน → ยิงเช้า (ข้อ 3.4)
    const trig = out.hunterTriggers[0];
    updates["hunter"] = hunterDie(trig.uid, trig.phase);
    updates["meta/phase"] = "hunter";
  } else {
    updates["meta/phase"] = "day";
  }

  // บันทึกล็อก (เห็นผลเช้า)
  for (const uid of out.deaths) logHost(`ตายคืนนี้: ${playerName(uid)} 💀 (${uid})`);
  for (const w of out.warnings) logHost(`⚠️ ${w}`);
  if (out.results.seer) logHost(`Seer ตรวจ → ${playerName(out.results.seer.target)} หมาป่า:${out.results.seer.isWolf}`);
  if (out.results.sorceress) logHost(`Sorceress ตรวจ → Seer:${out.results.sorceress.isSeer}`);
  if (winner && winner.winner) logHost(`ชนะแล้ว: ${WINNER_TH[winner.winner]} 🏁`);

  update(ref(db, `rooms/${roomCode}`), updates);
}

// เปิดโหวต (กลางวัน → โหวต)
function startVote() {
  if (!isHost()) return;
  update(ref(db, `rooms/${roomCode}/meta`), { phase: "vote" });
  logHost("เปิดโหวต 🗳️");
}

// สรุปโหวต (เหมือน finalizeVote ใน player-ui — logic เดียวกัน)
function finalizeVote() {
  if (!isHost() || !room || room.meta.phase !== "vote") return;

  // ตรวจก่อนว่ามีคนส่งโหวตแล้ว (เป็นไปได้ว่าโหวตมาก่อนเริ่ม)
  const playersData = Object.values(room.players).map((p) => ({ ...p }));
  const result = resolveVote(playersData);
  const out = applyVoteResult({
    players: playersData,
    lovers: (room.lovers && room.lovers.pair) || null,
    cursedStatuses: (room.secret && room.secret.cursed) || null,
    result,
    revealRole: (room.meta.settings && room.meta.settings.revealRoleOnDeath) !== false
  });

  const updates = {};
  for (const uid of out.deaths) {
    updates[`players/${uid}/alive`] = false;
    const p = out.players.find((x) => x.uid === uid);
    if (p.revealed) updates[`players/${uid}/revealed`] = true;
    logHost(`โหวตออก: ${playerName(uid)} 💀`);
  }

  if (out.hunterTrigger) {
    updates["hunter"] = hunterDie(out.hunterTrigger.uid, "day");
    updates["meta/phase"] = "hunter";
    logHost("นายพรานโดนโหวต → ยิงทันที 🏹");
  } else if (out.winner && out.winner.winner) {
    updates["meta/winner"] = out.winner.winner;
    updates["meta/phase"] = "end";
    logHost(`ชนะแล้ว: ${WINNER_TH[out.winner.winner]} 🏁`);
  } else {
    updates["meta/phase"] = "night";
    logHost("เข้าสู่กลางคืน 🌙");
  }

  // เคลียร์โหวตเก่าให้โหวตรอบใหม่เริ่มจากศูนย์ (ข้อ 3.3)
  for (const p of Object.values(room.players)) updates[`players/${p.uid}/voteTarget`] = null;

  update(ref(db, `rooms/${roomCode}`), updates);
}

// คืนถัดไป (หลังโหวต/เจองานเรียบร้อย) — day+1 แล้วเข้าคืนของวันใหม่
function nextNight() {
  if (!isHost()) return;
  const day = ((room.meta && room.meta.day) || 1) + 1;
  update(ref(db, `rooms/${roomCode}/meta`), { phase: "night", day, winner: null });
  logHost(`เข้าคืนที่ ${day} 🌙  — day+1 (ตาม flow ต่อเนื่อง)`);
}

// ============================================================
// แผงย่อย: ขั้นตอนกลางคืน (ข้อ 3.1)
// ============================================================
function renderNightSteps() {
  const ul = $id("night-steps");
  ul.innerHTML = "";
  const order = getNightOrder(alivePlayers().map((p) => ({ uid: p.uid, role: p.role, alive: p.alive })));

  for (const s of order) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = s.labelTH;
    li.appendChild(label);
    if (s.uids && s.uids.length) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = s.uids.length ? `${s.uids.length} คน` : "—";
      li.appendChild(count);
    }
    if (s.uids && s.uids.length) {
      const names = document.createElement("div");
      names.className = "hint";
      names.textContent = s.uids.map((u) => playerName(u)).join(", ");
      li.appendChild(names);
    }
    ul.appendChild(li);
  }
}

// ============================================================
// แผงย่อย: โหวตหมาป่าไลฟ์ (ข้อ 3.2) — โชว์ทุกคนที่ลง target
// ============================================================
function renderWolfVotes() {
  const ul = $id("wolf-vote-list");
  ul.innerHTML = "";
  const votes = (room.wolf && room.wolf.votes) || {};
  const entries = Object.entries(votes || {});

  if (entries.length === 0) {
    const li = document.createElement("li");
    li.textContent = "หมาป่ายังไม่ได้โหวต (ว่าง)";
    li.className = "dead";
    ul.appendChild(li);
    return;
  }

  for (const [voterUid, targetUid] of entries) {
    const li = document.createElement("li");
    li.classList.add("selectable");
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = "🐺";
    li.appendChild(av);
    const c = document.createElement("span");
    c.textContent = `${playerName(voterUid)} → ${playerName(targetUid)}`;
    li.appendChild(c);
    ul.appendChild(li);
  }
}

// ============================================================
// แผงย่อย: ผู้ต้องสาป (ข้อ 4) — สถานะ + โค้ดความจำ
// ============================================================
function renderCursedPanel() {
  const panel = $id("cursed-panel");
  panel.innerHTML = "";

  const cursed = (room.secret && room.secret.cursed) || {};
  const entries = Object.entries(cursed);

  if (entries.length) {
    const ul = document.createElement("ul");
    ul.className = "player-list";
    for (const [uid, st] of entries) {
      const li = document.createElement("li");
      const status = typeof st === "string" ? st : st && st.status;
      li.textContent = `${playerName(uid)} — ${status === "turned" ? "🐺 turned (คืน " + (st.turnedNight ?? "?") + ")" : "🏘️ ยังเป็นชาวบ้าน"}`;
      ul.appendChild(li);
    }
    panel.appendChild(ul);
  } else {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "ยังไม่มีสถานะ Cursed ในเกมนี้";
    panel.appendChild(p);
  }

  // ปุ่มแจ้ง "Cursed กลายเป็นหมาป่า" (คนทรงแจ้งปากเปล่า → ระบบ mark ตามข้อ 4)
  const row = document.createElement("div");
  row.className = "row";
  const sel = document.createElement("select");
  sel.id = "cursed-select";
  sel.innerHTML = "";
  for (const p of Object.values(room.players || {}).filter((x) => x.role === "cursed" && x.alive)) {
    const opt = document.createElement("option");
    opt.value = p.uid;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "แจ้งกลายเป็นหมาป่า 🐺";
  btn.onclick = () => {
    if (!isHost() || !sel.value) return;
    const meta = room.meta || {};
    const cur = (room.secret && room.secret.cursed) || {};
    const next = markCursedTurned(cur, sel.value, meta.day || 1);
    set(ref(db, `rooms/${roomCode}/secret/cursed/${sel.value}`), {
      status: next.cursed.status,
      turnedNight: next.cursed.turnedNight
    });
    logHost(
      `Cursed ${playerName(sel.value)} → turned (คืน ${next.cursed.turnedNight})` +
      (next.wolfKnowsNow ? " — หมาป่าระบบเห็นแล้ว" : " — จนกว่าจะถึงคืนถัดไป")
    );
  };
  row.appendChild(sel);
  row.appendChild(btn);
  panel.appendChild(row);
}

// ============================================================
// แผงย่อย: สลับคนทรง (ข้อ 3.6)
// ============================================================
function renderTransferPanel() {
  const panel = $id("transfer-panel");
  panel.innerHTML = "";

  const meta = room && room.meta;
  if (!meta) return;

  // ผู้เล่นที่ยังมีชีวิต เอาไว้ให้โอนต่อ
  const sel = document.createElement("select");
  sel.id = "transfer-select";
  for (const p of Object.values(room.players || {})) {
    if (!p.alive || p.uid === myUid) continue;
    const opt = document.createElement("option");
    opt.value = p.uid;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "โอนให้คนนี้";
  btn.onclick = () => {
    if (!isHost() || !sel.value) return;
    update(ref(db, `rooms/${roomCode}/meta`), hostTransfer(meta, sel.value));
    logHost(`โอนคนทรง → ${playerName(sel.value)} 🔑`);
  };

  const takeBtn = document.createElement("button");
  takeBtn.className = "btn";
  takeBtn.textContent = "ฉันรับต่อ (hostUid2)";
  takeBtn.onclick = () => {
    if (!isHost()) return;
    update(ref(db, `rooms/${roomCode}/meta`), hostTakeOver(meta, myUid));
    logHost(`รับต่อคนทรง: ${playerName(myUid)} 🔑`);
  };

  panel.appendChild(sel);
  panel.appendChild(btn);
  panel.appendChild(takeBtn);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = `${meta.hostUid2 ? "คนทรงหลัก: " + playerName(meta.hostUid) + " / รอง: " + playerName(meta.hostUid2) : "คนทรงหลัก: " + playerName(meta.hostUid)}`;
  panel.appendChild(hint);
}

// ============================================================
// render() — ตัวกระจายระหว่างโหมดผู้ชม / แผงคนทรง
// ============================================================
function render() {
  if (!room || !room.meta || !myUid) return;
  renderTopbar();

  const phase = room.meta.phase;
  const host = isHost();

  // ผู้ชม (คนตาย/ไม่ใช่ host): เปิดหน้าอ่านอย่างเดียว
  if (!host) {
    $id("screen-host").classList.add("hidden");
    $id("screen-spectate").classList.remove("hidden");
    renderSpectate();
    return;
  }

  // คนทรง: เปิดแผงคอนโทร
  $id("screen-spectate").classList.add("hidden");
  $id("screen-host").classList.remove("hidden");

  // แสดง/ซ่อนปุ่มตามเฟส
  $id("btn-start-night").classList.toggle("hidden", phase !== "lobby");
  $id("btn-resolve-night").classList.toggle("hidden", phase !== "night");
  $id("btn-start-vote").classList.toggle("hidden", phase !== "day");
  $id("btn-resolve-vote").classList.toggle("hidden", phase !== "vote");
  $id("btn-next-night").classList.toggle("hidden", phase !== "vote" && phase !== "hunter" && phase !== "day");

  $id("btn-start-night").onclick = startNight;
  $id("btn-resolve-night").onclick = resolveNightHost;
  $id("btn-start-vote").onclick = startVote;
  $id("btn-resolve-vote").onclick = finalizeVote;
  $id("btn-next-night").onclick = nextNight;

  renderNightSteps();
  renderWolfVotes();
  renderCursedPanel();
  renderTransferPanel();
}

// ============================================================
// renderSpectate() — มุมมองผู้ชม (อ่านอย่างเดียว เดิมจาก Day 10-11)
// ============================================================
function renderSpectate() {
  $id("phase-banner").textContent = PHASE_TH[room.meta.phase] || room.meta.phase;

  const list = $id("player-list");
  list.innerHTML = "";
  const players = Object.values(room.players || {})
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

  for (const p of players) {
    const li = document.createElement("li");
    if (p.alive !== true) li.classList.add("dead");
    li.classList.add("selectable");
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = (p.name || "?").charAt(0).toUpperCase();
    li.appendChild(av);
    const name = document.createElement("span");
    name.textContent = p.name || "(?)";
    li.appendChild(name);
    if (p.revealed === true && p.role) {
      const tag = document.createElement("span");
      tag.className = "count";
      tag.textContent = "เปิดแล้ว";
      li.appendChild(tag);
    }
    if (room.meta.phase === "vote") {
      const c = document.createElement("span");
      c.className = "count";
      c.textContent = `x${countVotesOf(p.uid)}`;
      li.appendChild(c);
    }
    list.appendChild(li);
  }

  const info = $id("vote-info");
  if (room.meta.phase === "vote") {
    let t = "โหวตสด: ";
    for (const p of players) {
      if (p.voteTarget) {
        const target = room.players[p.voteTarget];
        t += `${p.name}→${target ? target.name : "?"}  `;
      }
    }
    info.textContent = t;
  } else {
    info.textContent = "";
  }

  const w = room.meta.winner;
  $id("winner-info").textContent = room.meta.phase === "end" && w ? WINNER_TH[w] || "" : "";
}

// นับโหวตสด (spectator)
function countVotesOf(uid) {
  let n = 0;
  for (const p of Object.values(room.players || {})) {
    if (p.alive === true && p.voteTarget === uid) {
      n += p.mayorRevealed === true ? 2 : 1;
    }
  }
  return n;
}

// ============================================================
// init() — ล็อกอิน + subscribe ทั้งห้อง
// ============================================================
function init() {
  roomCode = getQueryParam("room");
  if (!roomCode) {
    document.body.innerHTML = "<p class='hint'>ไม่พบรหัสห้อง (?room=XXXX)</p>";
    return;
  }

  const auth = getAuth();
  signInAnonymously(auth).catch((e) => console.error("Login fail:", e));

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    myUid = user.uid;
    console.log("uid:", myUid);

    // อ่านแบบแยก node (Security Rules: ห้าม read ทั้งห้อง — ไม่งั้น secret รั่ว)
    room = { meta: null, players: {}, night: {}, wolf: {}, secret: {}, lovers: {} };
    let hostSensitiveBound = false;
    const bindHostSensitive = () => {
      if (hostSensitiveBound) return;
      hostSensitiveBound = true;

      // wolf: อ่านทีละโซนย่อย (rules กำหนด read แบบแยก node; ไม่อ่าน wolf เต็ม node)
      ["members", "victims", "knowsCursed", "lastBodyguardTarget", "doubleKill", "sickNext"].forEach((key) => {
        onValue(ref(db, `rooms/${roomCode}/wolf/${key}`), (snap) => {
          room.wolf[key] = snap.val();
          render();
        });
      });

      // night กลางคืน: rules มี read ที่ night (host) -> ต่อตรงได้
      onValue(ref(db, `rooms/${roomCode}/night`), (snap) => {
        room.night = snap.val() || {};
        render();
      });

      // lovers: อ่านสาธารณะ
      onValue(ref(db, `rooms/${roomCode}/lovers`), (snap) => {
        room.lovers = snap.val() || null;
        render();
      });

      render();
    };

    // ข้อมูล host-only ที่ต้องอ่านแบบราย uid (roles / cursed)
    // — เพราะ rules อนุญาตเฉพาะ secret/roles/$uid (host) ไม่ใช่ทั้งลิสต์
    const boundHostUids = new Set();
    const bindPlayersHostReads = () => {
      const players = room.players || {};
      for (const uid2 of Object.keys(players)) {
        if (boundHostUids.has(uid2)) continue;
        boundHostUids.add(uid2);
        onValue(ref(db, `rooms/${roomCode}/secret/roles/${uid2}`), (snap) => {
          const v = snap.val();
          if (!room.secret.roles) room.secret.roles = {};
          if (v) room.secret.roles[uid2] = v;
          render();
        });
        onValue(ref(db, `rooms/${roomCode}/secret/cursed/${uid2}`), (snap) => {
          const v = snap.val();
          if (!room.secret.cursed) room.secret.cursed = {};
          if (v) room.secret.cursed[uid2] = v;
          render();
        });
        onValue(ref(db, `rooms/${roomCode}/wolf/votes/${uid2}`), (snap) => {
          const v = snap.val();
          if (!room.wolf.votes) room.wolf.votes = {};
          if (v) room.wolf.votes[uid2] = v;
          render();
        });
      }
    };

    onValue(ref(db, `rooms/${roomCode}/meta`), (snap) => {
      room.meta = snap.val();
      if (isHost()) bindHostSensitive();
      render();
    });
    onValue(ref(db, `rooms/${roomCode}/players`), (snap) => {
      // normalize: key ของ /players/{uid} คือ identity → ใส่ uid จาก key ให้ object ด้วย
      room.players = Object.fromEntries(
        normalizePlayers(snap.val() || {}).map((p) => [p.uid, p])
      );
      if (isHost()) bindHostSensitive();
      if (isHost()) bindPlayersHostReads();
      render();
    });
  });
}

init();