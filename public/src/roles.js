// ============================================================
// roles.js — ข้อมูลบทบาททั้งหมดของ Werewolf Online v2.1
// อ้างอิงแผนข้อ 2 (บทบาททั้งหมด) + ข้อ 4 (กติกาเฉพาะบทบาท)
// ============================================================

// ROLE: ออบเจกต์กลางเก็บทุกบทบาท
// แต่ละบทบาทมีสมบัติ: id, nameTH, nameEN, team, description, iconPath
// team: "village" (ชาวบ้าน) | "wolf" (หมาป่า) | "neutral" (เป็นกลาง)
// iconPath: ชื่อไฟล์ตามมารคภาพข้อ 18 (วางใน assets/roles/)
export const ROLE = {
  // ---------- ฝ่ายชาวบ้าน (ข้อ 2.1) ----------
  villager: {
    id: "villager",
    nameTH: "ชาวบ้าน",
    nameEN: "Villager",
    team: "village",
    description: "ชาวบ้านธรรมดา ไม่มีความสามารถพิเศษ ตัดสินบนข้อมูลที่ทุกคนเห็นร่วมกัน",
    iconPath: "assets/roles/villager.png"
  },
  seer: {
    id: "seer",
    nameTH: "ผู้หยั่งรู้",
    nameEN: "Seer",
    team: "village",
    description: "ตรวจได้ 1 คนต่อคืน ว่าคนนั้นเป็นหมาป่าหรือไม่",
    iconPath: "assets/roles/seer.png"
  },
  doctor: {
    id: "doctor",
    nameTH: "หมอ",
    nameEN: "Doctor",
    team: "village",
    description: "ป้องกัน 1 คนต่อคืนจากหมาป่าฆ่า ซ้ำคนเดิมได้ ห้ามป้องกันตัวเอง",
    iconPath: "assets/roles/doctor.png"
  },
  hunter: {
    id: "hunter",
    nameTH: "นายพราน",
    nameEN: "Hunter",
    team: "village",
    description: "ตายกลางคืน (หมาป่า/แม่มด/คู่รัก) → เช้ายิงได้ 1 คน / ตายกลางวัน → เปิดบทบาท + ยิงทันที",
    iconPath: "assets/roles/hunter.png"
  },
  bodyguard: {
    id: "bodyguard",
    nameTH: "บอดี้การ์ด",
    nameEN: "Bodyguard",
    team: "village",
    description: "ป้องกัน 1 คนต่อคืนจากหมาป่าฆ่า ป้องกันตัวเองได้ ห้ามซ้ำคนเดิมจากคืนก่อน",
    iconPath: "assets/roles/bodyguard.png"
  },
  witch: {
    id: "witch",
    nameTH: "พ่อมด/แม่มด",
    nameEN: "Witch",
    team: "village",
    description: "มียาพิษ 1 + ยาป้องกันชีวิต 1 (กันหมาป่าฆ่า ใช้กับตัวเองได้) ห้ามใช้พร้อมกัน",
    iconPath: "assets/roles/witch.png"
  },
  cupid: {
    id: "cupid",
    nameTH: "คิวปิด",
    nameEN: "Cupid",
    team: "village",
    description: "คืนแรกเลือกคู่รัก 2 คน (Lovers) ที่จะตายตามกัน",
    iconPath: "assets/roles/cupid.png"
  },
  mayor: {
    id: "mayor",
    nameTH: "นายกเทศมนตรี",
    nameEN: "Mayor",
    team: "village",
    description: "สุ่มตั้งแต่เริ่ม กลางวันเลือกเปิดตัววันไหน หลังเปิดตัวมีสิทธิโหวต 2 เสียงตลอด",
    iconPath: "assets/roles/mayor.png"
  },
  auraSeer: {
    id: "auraSeer",
    nameTH: "ผู้หยั่งรู้ออร่า",
    nameEN: "Aura Seer",
    team: "village",
    description: "ตรวจ 1 คนต่อคืน แล้วรู้บทบาท (Role) ที่แท้จริงทันที",
    iconPath: "assets/roles/auraSeer.png"
  },
  mason: {
    id: "mason",
    nameTH: "ช่างก่ออิฐ",
    nameEN: "Mason",
    team: "village",
    description: "มี 2 คน รู้ว่าอีกคนเป็น Mason และเป็นฝ่ายดีด้วยกัน",
    iconPath: "assets/roles/mason.png"
  },
  diseased: {
    id: "diseased",
    nameTH: "ผู้ติดโรค",
    nameEN: "Diseased",
    team: "village",
    description: "ถ้าถูกหมาป่าฆ่า หมาป่าป่วย ทำให้ฆ่าใครไม่ได้ในคืนถัดไป",
    iconPath: "assets/roles/diseased.png"
  },
  insomniac: {
    id: "insomniac",
    nameTH: "คนนอนไม่หลับ",
    nameEN: "Insomniac",
    team: "village",
    description: "นอนไม่หลับค่ำคืน ชนะไปกับฝ่ายชาวบ้าน",
    iconPath: "assets/roles/insomniac.png"
  },
  cursed: {
    id: "cursed",
    nameTH: "ผู้ต้องสาป",
    nameEN: "Cursed",
    team: "village",
    description: "ยังเป็นฝ่ายชาวบ้าน ถ้าถูกหมาป่ากัดในคืนนั้นจะกลายเป็นหมาป่าเต็มตัว (ดูข้อ 4)",
    iconPath: "assets/roles/cursed.png"
  },

  // ---------- ฝ่ายหมาป่า (ข้อ 2.2) ----------
  werewolf: {
    id: "werewolf",
    nameTH: "หมาป่า",
    nameEN: "Werewolf",
    team: "wolf",
    description: "เลือกเหยื่อร่วมกับหมาป่าคนอื่น เห็นกันและกันแต่ไม่มีแชท",
    iconPath: "assets/roles/werewolf.png"
  },
  wolfCub: {
    id: "wolfCub",
    nameTH: "ลูกหมาป่า",
    nameEN: "Wolf Cub",
    team: "wolf",
    description: "เมื่อถูกฆ่า (ทุกวิธี) → คืนถัดไปหมาป่าฆ่าได้ 2 คน (คนละคน)",
    iconPath: "assets/roles/wolfCub.png"
  },
  sorceress: {
    id: "sorceress",
    nameTH: "แม่มดหมาป่า",
    nameEN: "Sorceress",
    team: "wolf",
    description: "ตรวจหา Seer 1 คนต่อคืน รู้แค่ใช่/ไม่ใช่ ร่วมฆ่ากับหมาป่า รู้จักหมาป่าคนอื่น",
    iconPath: "assets/roles/sorceress.png"
  },
  minion: {
    id: "minion",
    nameTH: "สมุน",
    nameEN: "Minion",
    team: "wolf",
    description: "รู้ว่าหมาป่าคือใคร แต่หมาป่าไม่รู้ว่าเป็นสมุน ไม่ร่วมฆ่า นับเป็นหมาป่าในเงื่อนไขชนะ",
    iconPath: "assets/roles/minion.png"
  },

  // ---------- ฝ่ายเป็นกลาง (ข้อ 2.3) ----------
  fool: {
    id: "fool",
    nameTH: "คนโง่",
    nameEN: "Fool",
    team: "neutral",
    description: "ชนะเมื่อถูกโหวตออกเท่านั้น เกมจะจบทันที (แม้ถูกโหวตพร้อมคู่รักก็ชนะเดี่ยว)",
    iconPath: "assets/roles/fool.png"
  }
};

// ชุดของบทบาทที่นับเป็นฝ่ายหมาป่า (ทีม wolf จาก ROLE)
const WOLF_TEAM_ROLES = new Set(
  Object.values(ROLE)
    .filter((r) => r.team === "wolf")
    .map((r) => r.id)
);

// ============================================================
// getTeam(role) — คืนฝ่ายพื้นฐานของบทบาท
// รับ role id (string) หรือ object บทบาทก็ได้
// คืนค่า: "village" | "wolf" | "neutral"
// หมายเหตุ: Cursed ยังคืน "village" (ก่อนถูกกัด) — ดู isWolfTeam
// ============================================================
export function getTeam(role) {
  if (typeof role === "object" && role !== null) return role.team;
  const r = ROLE[role];
  return r ? r.team : null;
}

// ============================================================
// isWolfTeam(role, cursedStatus) — ตัดสินใจว่านับเป็นฝ่ายหมาป่าหรือไม่
// ตามแผนข้อ 5.1:  หมาป่า = Werewolf, Wolf Cub, Sorceress, Minion,
//                  + Cursed หลังถูกกัด (turned)
// รับ: cursedStatus = "village" | "turned" | null/undefined
// คืนค่า: true ถ้านับเป็นหมาป่า
// ============================================================
export function isWolfTeam(role, cursedStatus) {
  if (typeof role === "object" && role !== null) role = role.id;
  // บทบาททีมหมาป่าประจำตัว
  if (WOLF_TEAM_ROLES.has(role)) return true;
  // Cursed จะกลายเป็นหมาป่าเมื่อ "turned" เท่านั้น
  if (role === "cursed" && cursedStatus === "turned") return true;
  return false;
}

// ============================================================
// getFactionRoleIds() — รายการ id ของทุกบทบาท (เรียงตามแผน)
// ใช้สำหรับยูทิลิตี้/เทสต์เท่านั้น
// ============================================================
export function getFactionRoleIds() {
  return Object.keys(ROLE);
}