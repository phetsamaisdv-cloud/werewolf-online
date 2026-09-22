// ============================================================
// profile-ui.js — หน้าสถิติผู้เล่น (แผนข้อ 6: Profile)
// ชื่อ + เกมที่เล่น + เกมที่ชนะ เก็บ localStorage (profile-store.js)
// ============================================================
import { loadProfile, resetProfile, saveProfile, setName } from "./profile-store.js";

const $id = (n) => document.getElementById(n);

function render(p) {
  $id("pf-name").value = p.name || "";
  $id("pf-played").textContent = p.played;
  $id("pf-won").textContent = p.won;
}

function init() {
  const p = loadProfile();
  render(p);

  $id("btn-save-name").addEventListener("click", () => {
    const name = $id("pf-name").value.trim();
    if (!name) {
      $id("pf-msg").textContent = "กรุณาพิมพ์ชื่อก่อนบันทึก";
      return;
    }
    const next = setName(name);
    render(next);
    $id("pf-msg").textContent = "✅ บันทึกชื่อแล้ว";
  });

  $id("btn-reset").addEventListener("click", () => {
    resetProfile();
    render(loadProfile());
    $id("pf-msg").textContent = "🗑️ ล้างสถิติแล้ว (ชื่อยังอยู่)";
  });
}

init();