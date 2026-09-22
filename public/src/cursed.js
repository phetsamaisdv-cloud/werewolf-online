// ============================================================
// cursed.js — กติกา ผู้ต้องสาป (Cursed) เวอร์ชัน v2.1
// อ้างอิงแผนข้อ 4 (กติกาเฉพาะบทบาท) + ข้อ 8 (Data Schema)
//
// สรุปกติกา Cursed v2.1:
//   - ยังเป็นฝ่ายชาวบ้านจนกว่าจะถูกหมาป่ากัด
//   - คืนที่ถูกกัด → status = "turned" ทันที (คนทรงแจ้งด้วยปากเปล่า
//     "คืนนี้เจ้าคือหมาป่า" + ชี้ให้รู้จักหมาป่าคนอื่น)
//   - หมาป่าฝั่งระบบจะ SEE รู้จัก Cursed เมื่อคืนถัดไป (turnedNight + 1)
//   - ถูกโหวตออกก่อนถูกกัด → ตายเป็นชาวบ้านปกติ
// ============================================================

export const CURSED_STATUS = {
  VILLAGE: "village", // ยังเป็นชาวบ้าน (ก่อนถูกกัด)
  TURNED: "turned"    // ถูกกัดแล้ว → เป็นหมาป่าเต็มตัว
};

// ------------------------------------------------------------
// updateCursedStatus(uid, wolfAttacked, currentNight)
// อัปเดตสถานะ Cursed ตามแผนข้อ 4
//   wolfAttacked = true  → คืนนี้โดนหมาป่าเลือกกัด → turned ทันที
// คืนค่า: ออบเจกต์สถานะใหม่ { uid, status, turnedNight }
//   - ถ้าโดนกัด: { status: "turned", turnedNight: currentNight }
//   - ถ้ายังไม่โดน: { status: "village", turnedNight: null }
// ------------------------------------------------------------
export function updateCursedStatus(uid, wolfAttacked, currentNight) {
  if (wolfAttacked) {
    // คนทรงแจ้งคนปากเปล่าคืนนั้น (ข้อ 4) + ระบบ mark ทันที
    return {
      uid,
      status: CURSED_STATUS.TURNED,
      turnedNight: currentNight
    };
  }
  return {
    uid,
    status: CURSED_STATUS.VILLAGE,
    turnedNight: null
  };
}

// ------------------------------------------------------------
// canWolfSeeCursed(turnedNight, currentNight)
// หมาป่าฝั่งระบบเห็นสถานะ Cursed ต้องเป็นคืนถัดไปขึ้นไป (turnedNight + 1)
// คืนค่า: true = หมาป่าอ่าน /secret/cursed ได้
// ------------------------------------------------------------
export function canWolfSeeCursed(turnedNight, currentNight) {
  return turnedNight != null && currentNight >= turnedNight + 1;
}

// ------------------------------------------------------------
// readCursedStatus(value) — แปลงข้อมูลจาก DB เป็นรูปแบบมาตรฐาน
// รองรับ: { status, turnedNight } และ string ตรง ๆ
// คืนค่า: { status, turnedNight } | null
// ------------------------------------------------------------
export function readCursedStatus(value) {
  if (!value) return null;
  if (typeof value === "string") return { status: value, turnedNight: null };
  if (typeof value === "object") {
    return { status: value.status || CURSED_STATUS.VILLAGE, turnedNight: value.turnedNight ?? null };
  }
  return null;
}