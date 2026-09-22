// ============================================================
// settings-store.js — การตั้งค่าห้อง (แชร์ระหว่าง settings.html กับ lobby)
// อ้างอิงแผนข้อ 8 (meta/settings) + ข้อ 7.2 (validation)
//   settings = { wolfCount, enabledRoles, timers, revealRoleOnDeath }
// เก็บ draft ลง localStorage → lobby โหลดตอนเริ่มเกม
// ============================================================
import { getFactionRoleIds } from "./roles.js";

export const SETTINGS_STORE_KEY = "werewolf_settings_draft";

export const ROOM_MIN_PLAYERS = 5;
export const ROOM_MAX_PLAYERS = 16;

// ------------------------------------------------------------
// recommendedWolfCount(n) — แนะนำจำนวนหมาป่าให้สมดุล (แผนข้อ 14)
//   5–9 คน → 2 / 10–12 → 3 / 13–16 → 3 (ชนชั้นล่างของช่วง "3–4")
// ------------------------------------------------------------
export function recommendedWolfCount(n) {
  if (n <= 9) return 2;
  return 3;
}

// ------------------------------------------------------------
// defaultSettings() — ค่าเริ่มต้นตามแผน (ข้อ 4 + 3.8)
// ------------------------------------------------------------
export function defaultSettings() {
  const roles = {};
  for (const id of getFactionRoleIds()) roles[id] = true;
  return {
    wolfCount: 2,
    enabledRoles: roles,
    timers: { night: 30, day: 45, vote: 30 },
    revealRoleOnDeath: true
  };
}

// ------------------------------------------------------------
// loadDraft() — อ่าน draft ที่คนทรงเซฟไว้ (ไม่มี → ค่าเริ่มต้น)
// ------------------------------------------------------------
export function loadDraft() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORE_KEY);
    if (!raw) return defaultSettings();
    return Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) {
    console.warn("load settings draft fail:", e);
    return defaultSettings();
  }
}

// ------------------------------------------------------------
// saveDraft(settings) — เขียน draft ลง localStorage
// ------------------------------------------------------------
export function saveDraft(settings) {
  localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settings));
}

// ------------------------------------------------------------
// validateSettings(settings) — เช็กค่ามาก่อนเริ่ม (แผนข้อ 7.2)
// คืนค่า: array ของข้อความเตือน (ว่าง = ผ่าน)
// ------------------------------------------------------------
export function validateSettings(settings) {
  const p = settings || {};
  const warns = [];

  if (!Number.isInteger(p.wolfCount) || p.wolfCount < 1) warns.push("จำนวนหมาป่า ต้องอย่างน้อย 1 ตัว");

  const wolfRoles = Object.entries(p.enabledRoles || {})
    .filter(([id, on]) => on && ["werewolf", "wolfCub", "sorceress", "minion"].includes(id))
    .length;
  if (wolfRoles === 0) warns.push("ไม่มีบทบาทฝ่ายหมาป่าเปิดอยู่เลย");
  if (p.wolfCount > wolfRoles) warns.push(`หมาป่า ${p.wolfCount} ตัว แต่มีบทบาทฝ่ายหมาป่าเปิดแค่ ${wolfRoles}`);

  for (const [ph, sec] of Object.entries(p.timers || {})) {
    if (!Number.isInteger(sec) || sec < 10) warns.push(`เวลาเฟส "${ph}" ไม่ต่ำกว่า 10 วิ`);
  }
  return warns;
}

// ------------------------------------------------------------
// validateRoomSetup(playerCount, settings) — เช็กก่อนแจกบทบาท (ข้อ 7.2)
// คืนค่า: { ok, warns }
// ------------------------------------------------------------
export function validateRoomSetup(playerCount, settings) {
  const warns = validateSettings(settings);
  if (playerCount < ROOM_MIN_PLAYERS) warns.push(`ต้องมีผู้เล่นอย่างน้อย ${ROOM_MIN_PLAYERS} คน (ตอนนี้ ${playerCount})`);
  if (playerCount > ROOM_MAX_PLAYERS) warns.push(`ห้องเต็มแล้ว (สูงสุด ${ROOM_MAX_PLAYERS} คน)`);

  const wolfCount = Math.min(settings.wolfCount || 0, playerCount);
  if (wolfCount === 0) warns.push("ไม่มีหมาป่า → เกมไม่start");

  return { ok: warns.length === 0, warns };
}