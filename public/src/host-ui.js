// ============================================================
// host-ui.js — Spectator mode (อ่านอย่างเดียว ใช้ host.html)
// อ้างอิงแผนข้อ 6 (Spectator ใช้ host.html แต่อ่านอย่างเดียว),
// ข้อ 3.4 (คนตายกลายเป็น spectator)
//
// ⚠️ ไฟล์นี้ = view อ่านอย่างเดียวเท่านั้น (ไม่เขียน Firebase)
//    คนทรงเต็มรูปแบบ (เรียกบทบาท / เปลี่ยนเฟส / transfer)
//    จะมาพร้อม host-control.js ในงาน Day 6-7
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, onValue } from "firebase/database";

let roomCode = null;
let room = null;

const $id = (n) => document.getElementById(n);

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const PHASE_TH = {
  lobby: "ล็อบบี้ 🛋️",
  night: "กลางคืน 🌙 (ทุกคนหลับตา)",
  day: "กลางวัน ☀️ (ถกเถียง)",
  vote: "โหวต 🗳️ (เปิด เห็นสด)",
  hunter: "นายพราน 🏹",
  end: "จบเกม 🏁"
};

const WINNER_TH = {
  villagers: "ชาวบ้านชนะ! 🎉",
  wolves: "หมาป่าชนะ! 🐺",
  lovers: "คู่รักชนะ! 💞",
  fool: "คนโง่ชนะเดี่ยว! 🤡"
};

// ------------------------------------------------------------
// countVotesOf(uid) — นับโหวตสดให้ spectator ดู (ข้อ 3.3 เห็นเรียลไทม์)
//   Mayor เปิดตัว = 2 เสียง
// ------------------------------------------------------------
function countVotesOf(uid) {
  if (!room || !room.players) return 0;
  let n = 0;
  for (const p of Object.values(room.players)) {
    if (p.alive === true && p.voteTarget === uid) {
      n += p.mayorRevealed === true ? 2 : 1;
    }
  }
  return n;
}

// ------------------------------------------------------------
// render() — เรนเดอร์ข้อมูลแบบอ่านอย่างเดียว
// ------------------------------------------------------------
function render() {
  if (!room || !room.meta) return;

  $id("room-code").textContent = roomCode;
  $id("day-label").textContent = `วัน ${room.meta.day || 0}`;
  const phase = room.meta.phase || "lobby";
  $id("phase-label").textContent = phase;
  $id("phase-banner").textContent = PHASE_TH[phase] || phase;

  // รายชื่อผู้เล่น (มีชีวิต/ตาย)
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

    // ป้ายเปิดบทบาทแล้ว (revealed)
    if (p.revealed === true && p.role) {
      const tag = document.createElement("span");
      tag.className = "count";
      tag.textContent = "เปิดแล้ว";
      li.appendChild(tag);
    }

    // โหวตสด: ระหว่างโหวตโชว์คะแนนไลฟ์ (ข้อ 3.3)
    if (phase === "vote") {
      const c = document.createElement("span");
      c.className = "count";
      c.textContent = `x${countVotesOf(p.uid)}`;
      li.appendChild(c);
    }
    list.appendChild(li);
  }

  // สรุปโหวต (ตอนโหวต)
  const info = $id("vote-info");
  if (phase === "vote") {
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

  // ผู้ชนะ (ตอนจบเกม)
  const w = room.meta.winner;
  $id("winner-info").textContent = phase === "end" && w ? WINNER_TH[w] || "" : "";
}

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
    // สมาชิกการอ่านอย่างเดียว: ฟังข้อมูลห้องเท่านั้น (ไม่เขียนเลย)
    onValue(ref(db, `rooms/${roomCode}`), (snap) => {
      room = snap.val();
      render();
    });
  });
}

init();