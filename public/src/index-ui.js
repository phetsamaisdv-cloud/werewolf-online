// ============================================================
// index-ui.js — หน้าแรก: ชื่อ + สร้าง/เข้าห้อง + Auth (แผนข้อ 6)
// อ้างอิงข้อ 7.1 (Room Code 4 หลัก ตรวจซ้ำ), ข้อ 8 (สร้าง meta/players)
// ใช้ settings-store โหลด draft ของคนทรงตอนสร้างห้อง
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, get, set, update } from "firebase/database";
import { genRoomCode } from "./room-utils.js";
import { loadDraft, ROOM_MAX_PLAYERS, ROOM_MIN_PLAYERS } from "./settings-store.js";
import { loadProfile, setName } from "./profile-store.js";

const $id = (n) => document.getElementById(n);

let uid = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ------------------------------------------------------------
// ensureUniqueCode() — วนสร้างรหัสจนกว่าจะไม่ชนกับห้องที่มีอยู่ (ข้อ 7.1)
// ------------------------------------------------------------
async function newUniqueCode() {
  for (let tries = 0; tries < 30; tries++) {
    const code = genRoomCode();
    const snap = await get(ref(db, `rooms/${code}/meta`));
    if (!snap.exists()) return code;
  }
  throw new Error("ไม่สามารถสร้างรหัสห้องได้ ลองใหม่");
}

// ------------------------------------------------------------
// createRoom() — สร้างห้องใหม่ + เข้าเป็นคนทรง (ข้อ 8)
// ------------------------------------------------------------
async function createRoom() {
  const name = nameValue("กรุณาใส่ชื่อก่อนสร้างห้อง");
  if (!name) return;

  try {
    const code = await newUniqueCode();
    const settings = loadDraft(); // โหลด draft จากหน้า settings (ข้อ 6)
    const now = Date.now();

    const payload = {
      meta: {
        hostUid: uid,
        hostUid2: null,
        phase: "lobby",
        day: 0,
        winner: null,
        settings
      },
      players: {
        [uid]: { name, alive: true, joinedAt: now, mayorRevealed: false }
      }
    };

    await set(ref(db, `rooms/${code}`), payload);
    localStorage.setItem("werewolf_last_uid", uid);
    setName(name);
    window.location.href = `lobby.html?room=${code}`;
  } catch (e) {
    $id("msg").textContent = `สร้างห้องไม่สำเร็จ: ${e.message}`;
  }
}

// ------------------------------------------------------------
// joinRoom(code) — เข้าห้องที่มีอยู่ (ตรวจ: มีห้อง, ยังไม่เต็ม, ยัง lobby)
// ------------------------------------------------------------
async function joinRoom(code) {
  const name = nameValue("กรุณาใส่ชื่อก่อนเข้าห้อง");
  if (!name) return;

  const roomCode = (code || "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
    $id("msg").textContent = "รหัสห้องต้องเป็นตัวอักษร/เลข 4 ตัว";
    return;
  }

  try {
    const roomSnap = await get(ref(db, `rooms/${roomCode}/meta`));
    const playersSnap = await get(ref(db, `rooms/${roomCode}/players`));
    const meta = roomSnap.val();
    if (!meta) {
      $id("msg").textContent = "ไม่พบห้องนี้ ตรวจรหัสอีกที";
      return;
    }
    if (meta.phase !== "lobby") {
      $id("msg").textContent = "เกมในห้องนี้เริ่มไปแล้ว ให้คนทรงเชิญหรือรอเกมใหม่";
      return;
    }
    const count = playersSnap.val() ? Object.keys(playersSnap.val()).length : 0;
    if (count >= ROOM_MAX_PLAYERS) {
      $id("msg").textContent = `ห้องเต็มแล้ว (สูงสุด ${ROOM_MAX_PLAYERS} คน)`;
      return;
    }
    if (count < ROOM_MIN_PLAYERS - 1) {
      // เตือนเบา ๆ ว่าอาจยังรอคนไม่ครบ ยังเข้าได้
    }

    await update(ref(db, `rooms/${roomCode}/players/${uid}`), {
      name,
      alive: true,
      joinedAt: Date.now(),
      mayorRevealed: false
    });
    localStorage.setItem("werewolf_last_uid", uid);
    setName(name);
    window.location.href = `lobby.html?room=${roomCode}`;
  } catch (e) {
    $id("msg").textContent = `เข้าห้องไม่สำเร็จ: ${e.message}`;
  }
}

function nameValue(emptyMsg) {
  const name = $id("name-input").value.trim();
  if (!name) {
    $id("msg").textContent = emptyMsg;
    return null;
  }
  return name;
}

function bind() {
  let creating = false;
  $id("btn-create").addEventListener("click", async () => {
    if (creating) return;
    creating = true;
    await createRoom();
    creating = false;
  });

  $id("btn-join").addEventListener("click", () => {
    joinRoom($id("join-code").value);
  });

  $id("join-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinRoom($id("join-code").value);
  });
  $id("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createRoom();
  });

  $id("name-input").value = loadProfile().name || "";
}

function init() {
  const auth = getAuth();
  signInAnonymously(auth).catch((e) => console.error("Login fail:", e));

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    uid = user.uid;
    bind();

    // ถ้าเปิดผ่านลิงก์ ?room=XXXX → เติมชื่อ (จากโปรไฟล์) แล้วโชว์
    const q = getQueryParam("room");
    if (q) $id("join-code").value = q.toUpperCase();
  });
}

init();