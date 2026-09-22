// ============================================================
// help-ui.js — หน้าช่วยเหลือ: render รายการบทบาทจาก ROLE (ข้อ 2)
// static content หลักอยู่ใน help.html (วิธีเล่น / เงื่อนไขชนะ / กติกาพิเศษ)
// ที่ render ด้วย JS คือรายการ role เพื่อไม่ให้ข้อมูลซ้ำซ้อนกับ roles.js
// ============================================================
import { ROLE, getFactionRoleIds, getTeam } from "./roles.js";

const TEAM_TH = { village: "🏘️ ชาวบ้าน", wolf: "🐺 หมาป่า", neutral: "🎭 กลาง" };
const TEAM_CLS = { village: "team-village", wolf: "team-wolf", neutral: "team-neutral" };

function renderRoles() {
  const host = document.getElementById("role-list");
  host.innerHTML = "";

  const groups = { village: [], wolf: [], neutral: [] };
  for (const id of getFactionRoleIds()) groups[getTeam(id)].push(id);

  for (const team of ["village", "wolf", "neutral"]) {
    const head = document.createElement("h3");
    head.className = `team-label ${TEAM_CLS[team]}`;
    head.textContent = `${TEAM_TH[team]} — ${groups[team].length} บทบาท`;
    host.appendChild(head);

    for (const id of groups[team]) {
      const r = ROLE[id];
      const card = document.createElement("details");
      card.className = "role-card";
      const sum = document.createElement("summary");
      sum.innerHTML = `<b>${r.nameTH}</b> <small>${r.nameEN}</small>`;
      const body = document.createElement("p");
      body.textContent = r.description;
      body.className = "hint";
      card.appendChild(sum);
      card.appendChild(body);
      host.appendChild(card);
    }
  }
}

renderRoles();