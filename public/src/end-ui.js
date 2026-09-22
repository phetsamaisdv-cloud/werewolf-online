// ============================================================
// end-ui.js — หน้าจอจบเกม (แสดงผู้ชนะ + เฉลยบทบาท + รีแมตช์)
// อ้างอิงแผนข้อ 5 (เงื่อนไขชนะ), 5.3, 6 (หน้าจอ), 3.7 (รีแมตช์)
//
// ความปลอดภัย (ข้อ 9: Security Rules):
//   - host อ่าน secret/roles ได้ทุกคน → เฉลยให้ครบ
//   - ผู้เล่นทั่วไปอ่าน secret/roles ได้เฉพาะของตัวเอง → เห็นเฉพาะตัวเอง
//   (ตามกฎ "ต้องไม่เห็นบทบาทคนอื่น" ที่ firewall บังคับแล้ว)
// ============================================================
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db } from "./firebase.js";
import { ref, onValue, update } from "firebase/database";

// ตัวแปรสถานะ
let roomCode = null;
let myUid = null;
let room = null;          // สแนปช็อตที่ประกอบจาก meta + players
let myRole = null;        // บทบาทของตัวเอง
let roleRevealBound = false; // กัน binding ซ้ำตอนเฟส end
const roles = {};         // บทบาทที่อ่านได้ (ของตัวเอง หรือทั้งหมดช่วง end)

const $id = (n) => document.getElementById(n);

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ------------------------------------------------------------
// isHost() — เราคือคนทรง (hostUid / hostUid2)
// ------------------------------------------------------------
function isHost() {
  const meta = room && room.meta;
  return !!meta && (meta.hostUid === myUid || meta.hostUid2 === myUid);
}

// แมปผู้ชนะ (winner จาก checkWin ข้อ 5.2) → ข้อความไทย
const WINNER_TH = {
  villagers: ["เกมจบ — ชาวบ้านชนะ! 🎉", "win"],
  wolves: ["เกมจบ — หมาป่าชนะ! 🐺", "lose"],
  lovers: ["เกมจบ — คู่รักชนะ! 💞", "win"],
  fool: ["เกมจบ — คนโง่ชนะเดี่ยว! 🤡", "lose"]
};

// ------------------------------------------------------------
// roleNameTH(roleId) — แปลง id บทบาท → ชื่อไทย (จาก roles.js)
// กลัวโหลด roles.js ใหญ่ ก็แมปสั้น ๆ ไว้ตรงนี้ดูอย่างเดียวแล้วกัน
// ------------------------------------------------------------
function roleNameTH(roleId) {
  const map = {
    villager: "ชาวบ้าน", seer: "ผู้หยั่งรู้", doctor: "หมอ", hunter: "นายพราน",
    bodyguard: "บอดี้การ์ด", witch: "แม่มด", cupid: "คิวปิด", mayor: "นายกเทศมนตรี",
    auraSeer: "ผู้หยั่งรู้ออร่า", mason: "ช่างก่ออิฐ", diseased: "ผู้ติดโรค",
    insomniac: "คนนอนไม่หลับ", cursed: "ผู้ต้องสาป", werewolf: "หมาป่า",
    wolfCub: "ลูกหมาป่า", sorceress: "แม่มดหมาป่า", minion: "สมุน", fool: "คนโง่"
  };
  return map[roleId] || roleId;
}

// ------------------------------------------------------------
// teamLabel(roleId) — ป้ายกำกับทีมสำหรับเฉลย
// ------------------------------------------------------------
function teamLabel(roleId) {
  const wolf = ["werewolf", "wolfCub", "sorceress", "minion"];
  if (wolf.includes(roleId)) return "🐺 หมาป่า";
  if (roleId === "fool") return "🤡 กลาง";
  return "🏘️ ชาวบ้าน";
}

// ------------------------------------------------------------
// renderWinner() — แสดงผู้ชนะ + เหตุผล (จาก /meta/winner)
// ------------------------------------------------------------
function renderWinner() {
  const w = (room.meta && room.meta.winner) || "unknown";
  const [text, cls] = WINNER_TH[w] || ["เกมจบ", ""];
  const t = $id("end-title");
  t.textContent = text;
  t.className = cls;
  $id("end-reason").textContent =
    `winner = "${w}" — รายละเอียดเงื่อนไขชนะตามข้อ 5.2 (Fool มาก่อน Lovers เสมอ)`;
}

// ------------------------------------------------------------
// renderRoles() — เฉลยบทบาท
//   host → เห็นทุกคน  / ผู้เล่น → เห็นเฉพาะตัวเอง
// ------------------------------------------------------------
function renderRoles() {
  if (!room || !room.players) return;
  $id("screen-reveal").classList.remove("hidden");

  $id("reveal-owner").textContent = isHost()
    ? "👑 คุณคือคนทรง — เห็นบทบาทของทุกคน"
    : "คุณเห็นเฉพาะบทบาทของตัวเอง (Security Rules ข้อ 9)";

  const list = $id("role-list");
  list.innerHTML = "";

  const allUids = Object.values(room.players)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .map((p) => p.uid);

  for (const uid of allUids) {
    const p = room.players[uid];
    const li = document.createElement("li");
    if (p.alive !== true) li.classList.add("dead");
    if (uid === myUid) li.classList.add("me");

    // avatar
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = (p.name || "?").charAt(0).toUpperCase();
    li.appendChild(av);

    // ชื่อ + สถานะ
    const name = document.createElement("span");
    const aliveTxt = p.alive === false ? " ☠️" : "";
    // ผู้เล่นทั่วไปจะเห็น role เฉพาะตัวเอง + ผู้ที่ถูกเปิดแล้ว (revealed)
    const canSeeRole = isHost() || uid === myUid || p.revealed === true;
    const roleTxt = canSeeRole ? ` — ${roleNameTH(roles[uid])} ${teamLabel(roles[uid])}` : "";
    name.textContent = `${p.name || "?"}${aliveTxt}${roleTxt}`;
    li.appendChild(name);

    list.appendChild(li);
  }
}

// ------------------------------------------------------------
// renderActions() — ปุ่มรีแมตช์ (host เท่านั้น, ข้อ 3.7) + ลิงค์ผู้ชม
// ------------------------------------------------------------
function renderActions() {
  $id("btn-rematch").classList.toggle("hidden", !isHost());
  $id("btn-rematch").onclick = rematch;

  // คนตาย → ไปดูแบบ Spectator ได้ (หน้าเดียวกับ host อ่านอย่างเดียว ข้อ 6)
  const me = room.players[myUid];
  const btnSpectate = $id("btn-spectate");
  if (me && me.alive === false) {
    btnSpectate.classList.remove("hidden");
    btnSpectate.href = `host.html?room=${roomCode}`;
  } else {
    btnSpectate.classList.add("hidden");
  }
}

// ------------------------------------------------------------
// rematch() — เล่นอีกครั้งกับกลุ่มเดิม (ข้อ 3.7)
//   รีเซ็ต: ทุกคนคืนชีพ, ล้างโหวต/สถานะ hunter/night/wolf/lovers,
//   กลับเฟส lobby ให้คนทรงจัดการเริ่มเกมใหม่ (แจกบทบาทใหม่)
//   เก็บ list ผู้เล่น + host เดิมไว้
// ------------------------------------------------------------
function rematch() {
  const updates = {};
  for (const p of Object.values(room.players)) {
    updates[`players/${p.uid}/alive`] = true;
    updates[`players/${p.uid}/voteTarget`] = null;
    updates[`players/${p.uid}/revealed`] = false;
    updates[`players/${p.uid}/mayorRevealed`] = false;
  }
  updates["night"] = null;   // ล้าง action กลางคืนเดิม
  updates["wolf"] = null;    // ล้างข้อมูลหมาป่าเดิม
  updates["hunter"] = null;  // ล้างนายพรานเดิม
  updates["lovers"] = null;  // ล้างคู่รัก (คิวปิดจะเลือกใหม่)
  updates["meta/phase"] = "lobby";
  updates["meta/winner"] = null;

  update(ref(db, `rooms/${roomCode}`), updates);
}

// ------------------------------------------------------------
// render() — รวมทุกส่วนของหน้า end
// ------------------------------------------------------------
function render() {
  if (!room || !room.meta || !myUid) return;
  $id("room-code").textContent = roomCode;
  $id("day-label").textContent = `วัน ${room.meta.day || 0}`;
  $id("phase-label").textContent = room.meta.phase || "end";
  renderWinner();
  renderRoles();
  renderActions();
}

// ------------------------------------------------------------
// init() — ล็อกอิน + subscribe ห้อง + บทบาทที่อ่านได้
// ------------------------------------------------------------
async function init() {
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

    // อ่านแบบแยก node (Security Rules: ห้าม read ทั้งห้อง — ไม่งั้น secret รั่ว)
    room = { meta: null, players: {} };
    onValue(ref(db, `rooms/${roomCode}/meta`), (snap) => {
      room.meta = snap.val();
      render();

      // ที่เฟส end ทุกคนอ่านบทบาททุกคนได้ (Security Rules: read secret/roles/$uid ช่วง end)
      if (room.meta && room.meta.phase === "end" && !roleRevealBound) {
        roleRevealBound = true;
        for (const uid2 of Object.keys(room.players || {})) {
          if (uid2 === myUid) continue;
          onValue(ref(db, `rooms/${roomCode}/secret/roles/${uid2}`), (r) => {
            const v = r.val();
            if (v && v.role) roles[uid2] = v.role;
            renderRoles();
          });
        }
      }
    });
    onValue(ref(db, `rooms/${roomCode}/players`), (snap) => {
      room.players = snap.val() || {};
      render();
    });

    // บทบาทตัวเอง (ทุกคนอ่านของตัวเองได้ ตามข้อ 9)
    const selfRole = ref(db, `rooms/${roomCode}/secret/roles/${myUid}`);
    onValue(selfRole, (r) => {
      const v = r.val();
      if (v && v.role) roles[myUid] = v.role;
      renderRoles();
    });
  });
}

init();