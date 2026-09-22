// ============================================================
// lobby-ui.js — ล็อบบี้: รอคนครบ + คนทรงเริ่มเกมแจกบทบาท
// อ้างอิงแผนข้อ 6 (Lobby), 7.2 (validation ก่อนเริ่ม), 8 (แจก secret/roles)
// เริ่มเกม: buildRoleDeck → เขียน /secret/roles + /wolf/members → เฟส night
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, onValue, update, set } from "firebase/database";
import { assignRolesToPlayers, buildRoleDeck, normalizePlayers } from "./room-utils.js";
import {
  ROOM_MAX_PLAYERS,
  loadDraft,
  validateRoomSetup
} from "./settings-store.js";
import { loadProfile } from "./profile-store.js";

const $id = (n) => document.getElementById(n);

let roomCode = null;
let myUid = null;
let room = null;
let redirecting = false;
let metaLoaded = false;    // meta โหลดครบหรือยัง
let playersLoaded = false; // players โหลดครบหรือยัง (กัน race → เด้งกะทันหัน)
let healingSelf = false;   // กัน insert ซ้ำ

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function isHost() {
  const meta = room && room.meta;
  return !!meta && (meta.hostUid === myUid || meta.hostUid2 === myUid);
}

// ------------------------------------------------------------
// playersSorted() — ผู้เล่นในล็อบบี้ (เรียงตาม joinedAt)
// key ของ /players/{uid} คือ identity ของผู้เล่น → ใส่ uid จาก key ด้วย
// ไม่งั้น core ของเกม (p.uid) ทำงานผิดทั้งเกม
// ------------------------------------------------------------
function playersSorted() {
  if (!room || !room.players) return [];
  return normalizePlayers(room.players)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

// ------------------------------------------------------------
// healSelf() — ถ้าเรายังไม่ขึ้นในรายชื่อ (เช่น identity เปลี่ยน / เขียนไม่ทัน)
//   ให้เขียนตัวเองเข้ารายชื่อ (rules อนุญาต self-write) แทนการเด้งออก
// ------------------------------------------------------------
async function healSelf() {
  if (!myUid || healingSelf || !room || !room.meta) return;
  // ถ้าเราเป็นคนสร้างห้องแต่ uid เปลี่ยน (incognito/หมดอายุ session) — บอกให้เข้าใหม่
  const lastUid = localStorage.getItem("werewolf_last_uid");
  if (lastUid && lastUid === room.meta.hostUid && lastUid !== myUid) {
    showHealMsg("เซสชันระบุตัวตนเปลี่ยน (เช่น โหมดไม่ระบุตัวตน หรือบัญชีหมดอายุ) — กรุณากลับหน้าแรก แล้วสร้าง/เข้าห้องใหม่อีกรอบ");
    return;
  }
  healingSelf = true;
  try {
    const profile = loadProfile();
    await set(ref(db, `rooms/${roomCode}/players/${myUid}`), {
      name: profile.name || "ผู้เล่น",
      alive: true,
      joinedAt: Date.now(),
      mayorRevealed: false
    });
    console.log("healSelf: เพิ่มตัวเองเข้ารายชื่อแล้ว");
  } catch (e) {
    console.error("healSelf fail:", e);
    setTimeout(() => { healingSelf = false; }, 1500);
  }
}

function showHealMsg(msg) {
  const el = $id("setup-warn");
  if (el) el.textContent = "⚠️ " + msg;
}

// ------------------------------------------------------------
// render() — เรนเดอร์ล็อบบี้
// ------------------------------------------------------------
function render() {
  if (!room || !room.meta || !myUid) return;

  $id("room-code").textContent = roomCode;
  $id("big-code").textContent = roomCode;
  $id("phase-label").textContent = room.meta.phase === "lobby" ? "ล็อบบี้ 🛋️" : room.meta.phase;

  // ยังไม่รู้ชุดข้อมูลครบ → รอ (กัน "เด้งออก" ก่อนที่ players จะมาทัน)
  if (!playersLoaded) return;

  const players = playersSorted();
  const inRoom = players.find((p) => p.uid === myUid);
  if (!inRoom) {
    if (room.meta.phase === "lobby") {
      // อยู่ในล็อบบี้: ใส่ตัวเองขึ้นรายชื่อเอาเอง (ไม่ต้องเด้งกลับหน้าแรก)
      healSelf();
      return;
    }
    // เกมเริ่มแล้วแต่เราไม่อยู่ในรายชื่อ → ถูกไล่ออกจากห้อง / ห้องเปลี่ยน → กลับหน้าแรก
    window.location.href = "./";
    return;
  }

  $id("player-count").textContent = `ผู้เล่น ${players.length}/${ROOM_MAX_PLAYERS}`;

  // รายชื่อ
  const list = $id("player-list");
  list.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.classList.add("selectable");
    if (p.uid === myUid) li.classList.add("me");
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = (p.name || "?").charAt(0).toUpperCase();
    li.appendChild(av);
    const name = document.createElement("span");
    name.textContent = p.name || "(?)";
    li.appendChild(name);
    if (p.uid === room.meta.hostUid) {
      const tag = document.createElement("span");
      tag.className = "count";
      tag.textContent = "👑 คนทรง";
      li.appendChild(tag);
    }
    list.appendChild(li);
  }

  // สรุป settings + ปุ่มเริ่มเกม (แก้กับ draft ล่าสุด)
  const settings = (room.meta.settings && Object.keys(room.meta.settings).length)
    ? room.meta.settings
    : loadDraft();

  const summary = $id("settings-summary");
  const onCount = Object.values(settings.enabledRoles || {}).filter(Boolean).length;
  summary.textContent =
    `🐺 หมาป่า ${settings.wolfCount} · 🎭 บทบาทที่เปิด ${onCount} · ` +
    `⏱️ ${settings.timers.night}/${settings.timers.day}/${settings.timers.vote} วิ (ค่ำ/กลางวัน/โหวต) · ` +
    (settings.revealRoleOnDeath ? "เปิดบทบาทเมื่อตาย ✅" : "ไม่เปิดบทบาทเมื่อตาย ❌");

  // คนทรงเท่านั้น: เริ่มเกม
  $id("host-panel").classList.toggle("hidden", !isHost());
  if (isHost()) {
    const setup = validateRoomSetup(players.length, settings);
    $id("setup-warn").textContent = setup.warns.length
      ? "⚠️ " + setup.warns.join(" · ")
      : "";
    const btn = $id("btn-start");
    btn.disabled = !setup.ok;
    btn.onclick = () => startGame(players, settings);
  }

  // out of lobby → redirect ตามบทบาท
  maybeRedirect(players);
}

// ------------------------------------------------------------
// maybeRedirect(players) — เกมเริ่มแล้ว → ไปหน้าของตัวเอง
//   host → host.html / ผู้เล่น → player.html / ตาย → host.html (spectator)
// ------------------------------------------------------------
function maybeRedirect(players) {
  if (redirecting) return;
  const phase = room.meta.phase;
  if (phase === "lobby") return;
  redirecting = true;

  const me = players.find((p) => p.uid === myUid);
  if (phase === "end") {
    window.location.href = `end.html?room=${roomCode}`;
  } else if (isHost() || (me && me.alive === false)) {
    window.location.href = `host.html?room=${roomCode}`;
  } else {
    window.location.href = `player.html?room=${roomCode}`;
  }
}

// ------------------------------------------------------------
// startGame(players, settings) — (คนทรง) แจกบทบาท + เริ่มคืน 1
// เขียน: /secret/roles/{uid} + /wolf/members/{uid} + meta → night
// ------------------------------------------------------------
async function startGame(players, settings) {
  if (!isHost()) return;

  const built = buildRoleDeck(players.length, settings);
  if (!built.ok) {
    $id("setup-warn").textContent = "⚠️ " + built.warned;
    return;
  }

  const assigned = assignRolesToPlayers(players, built.deck);
  const updates = {};

  for (const [puid, info] of Object.entries(assigned)) {
    updates[`secret/roles/${puid}`] = info;
  }
  // wolf/members: เฉพาะทีมหมาป่า (Werewolf/Cub/Sorceress/Minion — ข้อ 5.1)
  for (const [puid, info] of Object.entries(assigned)) {
    if (info.team === "wolf") updates[`wolf/members/${puid}`] = true;
  }

  updates["meta/phase"] = "night";
  updates["meta/day"] = 1;
  updates["meta/winner"] = null;
  updates["meta/settings"] = settings; // เก็บไว้ที่ meta (rules อนุญาต host) — ใช้ตอนเรนเดอร์/เช็กผล
  updates["meta/hostCall"] = null;

  try {
    await update(ref(db, `rooms/${roomCode}`), updates);
  } catch (e) {
    console.error("start game fail:", e);
    $id("setup-warn").textContent = "เริ่มเกมไม่สำเร็จ: " + e.message;
    redirecting = false;
  }
}

// ------------------------------------------------------------
// leaveRoom() — ออกจากห้อง (ลบข้อมูลตัวเอง)
// ------------------------------------------------------------
async function leaveRoom() {
  if (!myUid) return;
  try {
    await set(ref(db, `rooms/${roomCode}/players/${myUid}`), null);
  } catch (e) {
    console.error("leave fail:", e);
  }
  window.location.href = "./";
}

function bind() {
  $id("btn-copy").addEventListener("click", async () => {
    const url = `${window.location.origin}/index.html?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      $id("btn-copy").textContent = "✅ คัดลอกแล้ว";
    } catch (e) {
      $id("btn-copy").textContent = "คัดลอกไม่ได้ (กด ?room=" + roomCode + " ต่อท้ายลิงก์)";
    }
  });
  $id("btn-leave").addEventListener("click", leaveRoom);
}

function init() {
  roomCode = getQueryParam("room");
  if (!roomCode) {
    document.body.innerHTML = "<p class='hint'>ไม่พบรหัสห้อง (?room=XXXX) — กลับ <a href='./'>หน้าแรก</a></p>";
    return;
  }

  const auth = getAuth();
  signInAnonymously(auth).catch((e) => console.error("Login fail:", e));

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    myUid = user.uid;
    console.log("uid:", myUid);
    bind();
    // อ่านแบบแยก node (Security Rules: ห้าม read ทั้งห้อง — ไม่งั้น secret รั่ว)
    room = { meta: null, players: {} };
    onValue(ref(db, `rooms/${roomCode}/meta`), (snap) => {
      room.meta = snap.val();
      metaLoaded = true;
      render();
    });
    onValue(ref(db, `rooms/${roomCode}/players`), (snap) => {
      room.players = snap.val() || {};
      playersLoaded = true;
      render();
    });
  });
}

init();