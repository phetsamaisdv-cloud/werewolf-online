// ============================================================
// settings-ui.js — หน้าตั้งค่าห้อง (แผนข้อ 6 + ข้อ 8: settings)
// คนทรงตั้ง → องค์ประกอบตรงตาม schema:
//   settings = {
//     wolfCount, enabledRoles: {id:true}, timers:{night,day,vote}, revealRoleOnDeath
//   }
// บันทึกเป็น draft ลง localStorage ให้ล็อบบี้โหลดตอนเริ่มเกม
// ============================================================
import { ROLE, getFactionRoleIds, getTeam } from "./roles.js";

const $id = (n) => document.getElementById(n);

const STORE_KEY = "werewolf_settings_draft";

// ค่าเริ่มต้น (ตามแผนข้อ 4 + 3.8)
function defaultSettings() {
  const roles = {};
  for (const id of getFactionRoleIds()) roles[id] = true;
  return {
    wolfCount: 2,
    enabledRoles: roles,
    timers: { night: 30, day: 45, vote: 30 },
    revealRoleOnDeath: true
  };
}

// ฝ่าย → label ไทย + class
const TEAM_TH = { village: "ชาวบ้าน", wolf: "หมาป่า", neutral: "กลาง" };

let current = defaultSettings();

// ------------------------------------------------------------
// buildRoleToggles() — render checkbox ของทุกบทบาท (ข้อ 2.1-2.3)
// ------------------------------------------------------------
function buildRoleToggles() {
  const host = $id("role-toggle-list");
  host.innerHTML = "";

  const groups = { village: [], wolf: [], neutral: [] };
  for (const id of getFactionRoleIds()) groups[getTeam(id)].push(id);

  for (const team of ["village", "wolf", "neutral"]) {
    const head = document.createElement("h3");
    head.className = `team-label team-${team}`;
    head.textContent = `${TEAM_TH[team]} (${groups[team].length})`;
    host.appendChild(head);

    for (const id of groups[team]) {
      const r = ROLE[id];
      const label = document.createElement("label");
      label.className = "toggle-box";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.disabled = id === "werewolf"; // หมาป่าไม่สามารถปิดได้ (เกมต้องมี)
      cb.checked = current.enabledRoles[id] !== false;
      cb.addEventListener("change", () => {
        current.enabledRoles[id] = cb.checked;
        renderPreview();
      });
      const span = document.createElement("span");
      span.innerHTML = `<b>${r.nameTH}</b> <small>${r.nameEN} — ${r.description}</small>`;
      if (id === "werewolf") {
        const must = document.createElement("small");
        must.className = "warn";
        must.textContent = " (บังคับเปิด)";
        span.querySelector("b").appendChild(must);
      }
      label.appendChild(cb);
      label.appendChild(span);
      host.appendChild(label);
    }
  }
}

// ------------------------------------------------------------
// validate(p) — เช็กค่าที่ตั้งเพี้ยน (แผนข้อ 7.2)
//   - หมาป่าต้อง ≥ 1 และ ≤ จำนวนบทบาทหมาป่าที่เปิดอยู่
//   - timer ต่ำสุด 10 วิ
// คืนค่า: array of ข้อความเตือน
// ------------------------------------------------------------
function validate(p) {
  const warns = [];
  const wolfRoles = Object.keys(p.enabledRoles).filter((id) =>
    ["werewolf", "wolfCub", "sorceress", "minion", "cursed"].includes(id) &&
    p.enabledRoles[id] === true
  ).length;

  if (!Number.isInteger(p.wolfCount) || p.wolfCount < 1) warns.push("จำนวนหมาป่า ต้องอย่างน้อย 1 ตัว");
  if (p.wolfCount > wolfRoles) warns.push(`หมาป่า ${p.wolfCount} ตัว แต่บทบาทฝ่ายหมาป่าที่เปิดมี ${wolfRoles} บทบาท`);

  for (const [ph, sec] of Object.entries(p.timers)) {
    if (!Number.isInteger(sec) || sec < 10) warns.push(`เวลาเฟส "${ph}" ไม่ต่ำกว่า 10 วิ`);
  }
  return warns;
}

// ------------------------------------------------------------
// renderPreview() — แสดงผล JSON ปัจจุบัน
// ------------------------------------------------------------
function renderPreview() {
  const p = current;
  $id("settings-preview").value = JSON.stringify(p, null, 2);

  const warns = validate(p);
  $id("settings-warn").textContent = warns.length ? "⚠️ " + warns.join(" · ") : "";
  $id("settings-warn").classList.toggle("warn-on", warns.length > 0);
}

// ------------------------------------------------------------
// bindControls() — ผูก input ทั้งหมดเข้ากับ state
// ------------------------------------------------------------
function bindControls() {
  $id("set-wolf-count").value = String(current.wolfCount);
  $id("set-wolf-count").addEventListener("change", (e) => {
    current.wolfCount = Number(e.target.value);
    renderPreview();
  });

  $id("set-reveal").checked = current.revealRoleOnDeath;
  $id("set-reveal").addEventListener("change", (e) => {
    current.revealRoleOnDeath = e.target.checked;
    renderPreview();
  });

  const timers = { night: $id("set-timer-night"), day: $id("set-timer-day"), vote: $id("set-timer-vote") };
  for (const [ph, el] of Object.entries(timers)) {
    el.value = String(current.timers[ph]);
    el.addEventListener("input", (e) => {
      current.timers[ph] = Number(e.target.value);
      renderPreview();
    });
  }

  $id("btn-save-draft").addEventListener("click", saveDraft);
  $id("btn-reset-default").addEventListener("click", resetDefault);
}

// ------------------------------------------------------------
// saveDraft() — บันทึก draft ลง localStorage
// ------------------------------------------------------------
function saveDraft() {
  const warns = validate(current);
  if (warns.length) {
    $id("save-msg").textContent = "ยังเซฟไม่ได้ — " + warns.join(" · ");
    return;
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(current));
  $id("save-msg").textContent = "✅ บันทึกการตั้งค่าแล้ว (จะโหลดให้ล็อบบี้ตอนสร้างห้อง)";
}

// ------------------------------------------------------------
// resetDefault() — กลับค่าเริ่มต้น
// ------------------------------------------------------------
function resetDefault() {
  current = defaultSettings();
  buildRoleToggles();
  bindControls();
  renderPreview();
  $id("save-msg").textContent = "";
}

function init() {
  // โหลด draft เดิมถ้ามี (เผื่อกลับมาแก้)
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) current = Object.assign(defaultSettings(), JSON.parse(saved));
  } catch (e) {
    console.warn("load settings draft fail:", e);
  }
  buildRoleToggles();
  bindControls();
  renderPreview();
}

init();