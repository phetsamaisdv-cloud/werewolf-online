// ============================================================
// settings-ui.js — หน้าตั้งค่าห้อง (แผนข้อ 6 + ข้อ 8: settings)
// คนทรงตั้ง → องค์ประกอบตรงตาม schema:
//   settings = {
//     wolfCount, enabledRoles: {id:true}, timers:{night,day,vote}, revealRoleOnDeath
//   }
// บันทึกเป็น draft ลง localStorage ให้ล็อบบี้โหลดตอนเริ่มเกม
// (logic อยู่ settings-store.js — ไฟล์นี้เป็นแค่ render + bind)
// ============================================================
import { ROLE, getFactionRoleIds, getTeam } from "./roles.js";
import {
  defaultSettings,
  loadDraft,
  saveDraft as persistDraft,
  validateSettings
} from "./settings-store.js";

const $id = (n) => document.getElementById(n);

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
// renderPreview() — แสดงผล JSON ปัจจุบัน
// ------------------------------------------------------------
function renderPreview() {
  const p = current;
  $id("settings-preview").value = JSON.stringify(p, null, 2);

  const warns = validateSettings(p);
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
  const warns = validateSettings(current);
  if (warns.length) {
    $id("save-msg").textContent = "ยังเซฟไม่ได้ — " + warns.join(" · ");
    return;
  }
  persistDraft(current);
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
  current = loadDraft();
  buildRoleToggles();
  bindControls();
  renderPreview();
}

init();