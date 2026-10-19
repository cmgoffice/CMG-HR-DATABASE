/**
 * CMG HR Dashboard -> LINE OA daily report
 * ---------------------------------------
 * ส่งสรุปรายงาน Dashboard (จำนวนพนักงาน, เคสที่ต้องติดตาม, คนลาวันนี้ ฯลฯ)
 * จาก Firestore ของระบบ CMG-HR-DATABASE เข้ากลุ่มไลน์ผ่าน LINE Messaging API
 *
 * วิธีตั้งค่า: ดู README.md ในโฟลเดอร์เดียวกัน
 *
 * ต้องตั้งค่า Script Properties (Project Settings > Script Properties) ดังนี้:
 *   FIRESTORE_PROJECT_ID          เช่น "cmg-hr-database"
 *   SERVICE_ACCOUNT_EMAIL         อีเมล service account จาก JSON key
 *   SERVICE_ACCOUNT_PRIVATE_KEY   private_key จาก JSON key (คง \n ไว้)
 *   LINE_CHANNEL_ACCESS_TOKEN     Channel access token ของ LINE OA (Messaging API)
 *   LINE_GROUP_ID                 groupId ของกลุ่มไลน์ที่ต้องการส่งแจ้งเตือน
 */

var FIRESTORE_ROOT_PATH = "CMG-HR-Database/root"; // โครงสร้างฐานข้อมูลตามที่ใช้ใน React app
var ACTIVE_EMPLOYEE_STATUS_VALUE = "ทำงาน"; // ค่าฟิลด์ "สถานะพนักงาน" ที่หมายถึงทำงานอยู่

/** ========== ENTRY POINTS (ตั้ง Trigger ให้เรียกฟังก์ชันเหล่านี้) ========== */

/**
 * เรียกทุกเช้า (ตั้ง time-driven trigger) เพื่อส่งสรุปรายวัน
 * ส่งเป็น **Flex card เดียว 1 ข้อความ** (รวมรายชื่อเคสติดตามไว้ในการ์ดเดียวกันแล้ว ไม่แยกส่งข้อความ text เพิ่ม)
 * เพื่อประหยัดโควต้าข้อความ LINE (ดู MONTHLY_MESSAGE_LIMIT ด้านล่าง)
 */
function sendDailyDashboardReport() {
  var data = computeDailyDashboardData_();
  sendLinePushMessages_([buildDailyDashboardFlexMessage_(data)]);
}

/**
 * เรียกทุกเช้า (ตั้ง time-driven trigger แยกต่างหาก) เพื่อส่งรายงานแยกตามโครงการ
 * - ถ้าวันนี้ไม่มีโครงการมีปัญหาเลย: ส่งแค่ **1 ข้อความ text** สั้นๆ
 * - ถ้ามีโครงการมีปัญหา: ส่งเป็น Flex Carousel โดยการ์ดใบแรกคือ "การ์ดสรุปภาพรวม"
 *   (แทนที่การส่งข้อความ text สรุปแยกต่างหากแบบเดิม) ตามด้วยการ์ดโครงการที่มีปัญหา
 *   รวมทั้งหมดปกติจะเป็น **1 ข้อความ/วัน** (เว้นแต่มีโครงการมีปัญหาเกิน 11 โครงการ ถึงจะแตกเป็นหลายข้อความ)
 */
function sendProjectAttendanceReport() {
  var data = computeProjectAttendanceData_();
  if (data.problemProjects.length === 0) {
    sendLinePushMessages_([textMessage_(buildProjectAttendanceSummaryText_(data))]);
    return;
  }
  sendLinePushMessages_(buildProjectAttendanceFlexMessages_(data));
}

/** ดูตัวอย่างรายงานแยกตามโครงการก่อนส่งจริง (log ข้อความ/JSON ที่จะถูกส่งจริงทั้งหมด) */
function previewProjectAttendanceReport() {
  var data = computeProjectAttendanceData_();

  if (data.problemProjects.length === 0) {
    Logger.log("===== วันนี้ไม่มีโครงการมีปัญหา จะส่งแค่ 1 ข้อความ text =====");
    Logger.log(buildProjectAttendanceSummaryText_(data));
    return;
  }

  var flexMessages = buildProjectAttendanceFlexMessages_(data);
  flexMessages.forEach(function (msg, idx) {
    Logger.log(
      "===== Flex Carousel " + (idx + 1) + " / " + flexMessages.length + " (altText: " + msg.altText + ") ====="
    );
    Logger.log(JSON.stringify(msg.contents, null, 2));
  });

  Logger.log("รวมทั้งหมด: " + flexMessages.length + " ข้อความ (การ์ดใบแรกของชุดแรกคือการ์ดสรุปภาพรวม)");
}

/**
 * เหมือน previewProjectAttendanceReport แต่เขียนผลลัพธ์ลง Google Doc แทนการ Logger.log
 * ใช้ตอนที่ JSON ยาวเกินจน Execution log ตัดทิ้ง (ขึ้น "Logging output too large")
 * เปิดลิงก์ที่ได้ แล้วคัดลอก JSON แต่ละก้อนทั้งหมดไปวางทดสอบที่ LINE Flex Message Simulator ได้แบบไม่ขาดตอน
 */
function previewProjectAttendanceReportToDoc() {
  var data = computeProjectAttendanceData_();
  var docName =
    "LINE Flex Preview " + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
  var doc = DocumentApp.create(docName);
  var body = doc.getBody();

  var dashboardData = computeDailyDashboardData_();
  var dashboardFlex = buildDailyDashboardFlexMessage_(dashboardData);
  body
    .appendParagraph("Flex Card ภาพรวม (altText: " + dashboardFlex.altText + ")")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(JSON.stringify(dashboardFlex.contents, null, 2));

  body.appendParagraph("ข้อความสรุปแยกตามโครงการ (text)").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(buildProjectAttendanceSummaryText_(data));

  var flexMessages = buildProjectAttendanceFlexMessages_(data);
  flexMessages.forEach(function (msg, idx) {
    body
      .appendParagraph(
        "Flex Carousel " + (idx + 1) + " / " + flexMessages.length + " (altText: " + msg.altText + ")"
      )
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(JSON.stringify(msg.contents, null, 2));
  });

  doc.saveAndClose();
  Logger.log("สร้างไฟล์ preview เรียบร้อยแล้ว เปิดดู JSON แบบเต็มได้ที่ลิงก์นี้:");
  Logger.log(doc.getUrl());
}

/**
 * ทดสอบส่ง Flex Carousel "ชุดแรกเท่านั้น" เข้ากลุ่มจริง (ไม่ส่งข้อความสรุป)
 * เป็นวิธีทดสอบที่น่าเชื่อถือที่สุด เพราะ LINE server เป็นผู้ตรวจสอบ JSON เองโดยตรง
 * ถ้า JSON ผิดพลาด error message ที่ได้กลับมาจะบอกชัดเจนกว่าการเดาจาก log ที่ถูกตัด
 */
function testSendFirstProjectFlexCard() {
  var data = computeProjectAttendanceData_();
  var flexMessages = buildProjectAttendanceFlexMessages_(data);
  if (flexMessages.length === 0) {
    Logger.log("วันนี้ไม่มีโครงการที่มีปัญหาเลย ไม่มี Flex Carousel ให้ทดสอบส่ง");
    return;
  }
  sendLinePushMessages_([flexMessages[0]]);
  Logger.log("ส่ง Flex Carousel ชุดแรกไปแล้ว เช็กในกลุ่มไลน์ได้เลย");
}

/** ใช้ทดสอบส่งข้อความง่ายๆ ก่อนต่อข้อมูลจริง */
function testSendMessage() {
  sendLineMessage_(
    "✅ ทดสอบการเชื่อมต่อ LINE OA จาก Google Apps Script สำเร็จ\n" +
      Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm")
  );
}

/** ใช้ดูข้อความที่จะส่งก่อนจริง (จะ log ใน Execution log แทนการส่งเข้า LINE) */
function previewDailyReportMessage() {
  Logger.log(buildDailyReportMessage_());
}

/** ดูตัวอย่าง Flex card ภาพรวม (1 ข้อความเดียว รวมเคสติดตามไว้ในการ์ดแล้ว) ก่อนส่งจริง */
function previewDailyDashboardReport() {
  var data = computeDailyDashboardData_();
  var flexMsg = buildDailyDashboardFlexMessage_(data);

  Logger.log("===== Flex Card ภาพรวม (altText: " + flexMsg.altText + ") — ส่งจริง 1 ข้อความ =====");
  Logger.log(JSON.stringify(flexMsg.contents, null, 2));
}

/** ทดสอบส่ง Flex card ภาพรวมเข้ากลุ่มจริง (วิธีที่น่าเชื่อถือที่สุดในการตรวจ JSON) */
function testSendDailyDashboardCard() {
  var data = computeDailyDashboardData_();
  sendLinePushMessages_([buildDailyDashboardFlexMessage_(data)]);
  Logger.log("ส่ง Flex card ภาพรวมไปแล้ว เช็กในกลุ่มไลน์ได้เลย");
}

/**
 * ลบ access token เก่าที่ cache ไว้ (เช่นตอนที่เพิ่งแก้ scope หรือเปลี่ยน private key)
 * รันฟังก์ชันนี้ครั้งเดียวหลังแก้ปัญหา auth แล้วค่อยลองใหม่ เพื่อไม่ต้องรอ cache หมดอายุ (สูงสุด 50 นาที)
 */
function clearFirestoreTokenCache() {
  CacheService.getScriptCache().remove("firestore_access_token");
  Logger.log("ล้าง cache access token เรียบร้อยแล้ว เรียก Firestore ครั้งถัดไปจะขอ token ใหม่");
}

/** ========== รายงานสรุป ========== */

/**
 * ดึง + คำนวณข้อมูลภาพรวม Dashboard ทั้งหมด (ใช้ร่วมกันทั้งเวอร์ชัน text เดิมและ Flex card ใหม่)
 * คืนค่า { todayLabel, activeTotal, presentCount, absentCount, leaveCount, openFollowUps, genderCounts, typeBreakdown }
 */
function computeDailyDashboardData_() {
  var employees = firestoreListDocuments_(FIRESTORE_ROOT_PATH + "/employee_data");
  var followUps = firestoreListDocuments_(FIRESTORE_ROOT_PATH + "/employee_follow_ups");

  var todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  var todayLabel = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");

  // จำนวนพนักงานที่สถานะ "ทำงาน" อยู่
  var activeEmployees = employees.filter(function (e) {
    return e["สถานะพนักงาน"] === ACTIVE_EMPLOYEE_STATUS_VALUE;
  });

  // เคสติดตาม (follow-up) ที่ยังเปิดอยู่ (ยังไม่ closed / no_action)
  var openStatuses = {
    pending: true,
    proposed: true,
    in_progress: true,
    awaiting_hrm_review: true,
    approved_pending_execution: true,
    awaiting_document_review: true,
    approved_pending_issue: true,
    document_issued: true,
  };
  var openFollowUps = followUps.filter(function (f) {
    return openStatuses[f.status] === true;
  });

  // มา/ขาด/ลาวันนี้ อ้างอิงจาก attendance/{วันนี้} (ไม่ใช่ day_offs ซึ่งเป็นวันหยุดบริษัท)
  var attendanceDoc = firestoreGetDocument_(FIRESTORE_ROOT_PATH + "/attendance/" + todayStr);
  var records = (attendanceDoc && attendanceDoc.records) || {};
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  activeEmployees.forEach(function (emp) {
    var status = records[emp.id] && records[emp.id].status;
    if (status === ATTENDANCE_PRESENT_STATUS) presentCount++;
    else if (status === ATTENDANCE_ABSENT_STATUS) absentCount++;
    else if (ATTENDANCE_LEAVE_STATUSES[status]) leaveCount++;
  });

  // เพศ
  var genderCounts = { ชาย: 0, หญิง: 0, ไม่ระบุ: 0 };
  activeEmployees.forEach(function (emp) {
    var g = inferGender_(emp);
    genderCounts[g] = (genderCounts[g] || 0) + 1;
  });

  // สัดส่วนกำลังคน (DC / Supply Thai / Supply Foreigner)
  var typeBreakdown = computeEmployeeTypeBreakdown_(activeEmployees);

  // OT สะสมเดือนนี้ (Top N คนที่ OT เยอะสุด) + แนวโน้มมาทำงาน 7 วันล่าสุด (สำหรับทำ "กราฟ" แบบ Flex)
  var otBurden = computeOtBurdenData_(activeEmployees);
  var trend = computeAttendanceTrend_(activeEmployees);

  return {
    todayLabel: todayLabel,
    activeTotal: activeEmployees.length,
    presentCount: presentCount,
    absentCount: absentCount,
    leaveCount: leaveCount,
    openFollowUps: openFollowUps,
    genderCounts: genderCounts,
    typeBreakdown: typeBreakdown,
    otBurden: otBurden,
    trend: trend,
  };
}

/** ========== "กราฟ" แบบ Flex (ไม่มี chart จริง แต่ใช้ box/filler ทำ bar + unicode sparkline แทน) ========== */

var FLEX_BAR_TOTAL_UNITS = 20; // ความละเอียดของแท่ง bar (ยิ่งมากยิ่งขยับทีละน้อยลง)
var SPARKLINE_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]; // ใช้ทำกราฟเส้นแบบย่อ (sparkline) ในข้อความเดียว

/**
 * สร้าง 1 แถว "bar chart" ใน Flex (label + ค่า ด้านบน, แท่งสีด้านล่าง) โดยใช้ box ซ้อนกัน + "filler"
 * (LINE Flex ไม่มี chart component จริง นี่คือเทคนิคมาตรฐานที่ใช้ box 2 อันแบ่ง flex ratio กันแทนแท่งกราฟ)
 */
function buildFlexBarRow_(labelText, valueText, ratio, barColor) {
  var clamped = Math.max(0, Math.min(1, ratio || 0));
  var filled = clamped > 0 ? Math.max(1, Math.round(clamped * FLEX_BAR_TOTAL_UNITS)) : 0;
  var empty = FLEX_BAR_TOTAL_UNITS - filled;

  var barBoxes = [];
  if (filled > 0) {
    barBoxes.push({
      type: "box",
      layout: "vertical",
      flex: filled,
      backgroundColor: barColor,
      cornerRadius: "3px",
      height: "7px",
      contents: [{ type: "filler" }],
    });
  }
  barBoxes.push({
    type: "box",
    layout: "vertical",
    flex: empty > 0 ? empty : 1,
    backgroundColor: empty > 0 ? "#e5e7eb" : barColor,
    cornerRadius: "3px",
    height: "7px",
    contents: [{ type: "filler" }],
  });

  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: labelText, size: "xxs", color: "#374151", flex: 6, wrap: true },
          { type: "text", text: valueText, size: "xxs", color: "#111827", weight: "bold", align: "end", flex: 3 },
        ],
      },
      { type: "box", layout: "horizontal", height: "7px", contents: barBoxes },
    ],
  };
}

// เพดาน OT สะสม/เดือน (ค่า default เดียวกับ src/config/overtimeLimits.ts ของเว็บแอป)
// ⚠️ ถ้าแอดมินแก้ตัวเลขเพดานในหน้าเว็บ (Firestore: settings/overtime_limits) ค่านี้จะไม่อัปเดตตาม
// ต้องมาแก้เลขในนี้ให้ตรงกันเองด้วยมือ (ทำให้ไม่ต้องเพิ่มการเรียก Firestore อีก 1 ครั้งทุกวัน)
var OT_MONTHLY_TIERS = [
  { id: "normal", min: 0, max: 20, color: "#10b981" },
  { id: "watch", min: 21, max: 24, color: "#eab308" },
  { id: "near_cap", min: 25, max: 30, color: "#f97316" },
  { id: "over_cap", min: 31, max: 48, color: "#ef4444" },
  { id: "exceptional", min: 49, max: null, color: "#991b1b" },
];

function getOtTierColor_(hours) {
  for (var i = 0; i < OT_MONTHLY_TIERS.length; i++) {
    var t = OT_MONTHLY_TIERS[i];
    if (hours >= t.min && (t.max === null || hours <= t.max)) return t.color;
  }
  return "#6b7280";
}

var OT_BURDEN_TOP_N = 5; // แสดง Top N คนที่ OT สะสมเดือนนี้เยอะสุด

/**
 * รวม OT สะสมตั้งแต่ต้นเดือนถึงวันนี้ ของพนักงานที่ยังทำงานอยู่ทุกคน แล้วคืน Top N คนที่เยอะสุด
 * ดึงจาก collection "overtime/{yyyy-MM-dd}" ทีละวัน (field records[empId].hours) รวม 1-31 ครั้ง/เดือน
 */
function computeOtBurdenData_(activeEmployees) {
  var now = new Date();
  var monthLabel = Utilities.formatDate(now, "Asia/Bangkok", "MM/yyyy");
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  var nameById = {};
  activeEmployees.forEach(function (emp) {
    nameById[emp.id] = ((emp["ชื่อตัว"] || "") + " " + (emp["ชื่อสกุล"] || "")).trim() || emp["รหัสพนักงาน"] || emp.id;
  });

  var totals = {}; // employeeId -> ชั่วโมง OT สะสม
  var cursor = new Date(monthStart.getTime());
  while (cursor.getTime() <= now.getTime()) {
    var dateStr = Utilities.formatDate(cursor, "Asia/Bangkok", "yyyy-MM-dd");
    var doc = firestoreGetDocument_(FIRESTORE_ROOT_PATH + "/overtime/" + dateStr);
    var records = (doc && doc.records) || {};
    Object.keys(records).forEach(function (empId) {
      if (!nameById[empId]) return; // นับเฉพาะคนที่ยังทำงานอยู่ตอนนี้ (ไม่รวมคนที่ลาออกไปแล้ว)
      var hours = Number(records[empId] && records[empId].hours) || 0;
      totals[empId] = (totals[empId] || 0) + hours;
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  var rows = Object.keys(totals)
    .map(function (empId) {
      return { employeeId: empId, name: nameById[empId], hours: totals[empId] };
    })
    .filter(function (r) {
      return r.hours > 0;
    })
    .sort(function (a, b) {
      return b.hours - a.hours;
    });

  var topEmployees = rows.slice(0, OT_BURDEN_TOP_N);

  return {
    monthLabel: monthLabel,
    topEmployees: topEmployees,
    maxHours: topEmployees.length > 0 ? topEmployees[0].hours : 0,
    totalEmployeesWithOt: rows.length,
  };
}

var ATTENDANCE_TREND_DAYS = 7; // จำนวนวันย้อนหลังที่เอามาทำ sparkline แนวโน้มมาทำงาน

/**
 * สร้างแนวโน้ม "% มาทำงาน" ย้อนหลัง N วัน (เทียบกับจำนวนพนักงานทำงานอยู่ ณ วันนี้เป็นตัวหารเดียวกันทุกวัน
 * เพื่อความง่าย — ถ้าช่วงนั้นมีคนเข้า-ออกงานพอดี ตัวเลขอาจคลาดเคลื่อนเล็กน้อย) แล้วแปลงเป็น sparkline 1 บรรทัด
 */
function computeAttendanceTrend_(activeEmployees) {
  var activeTotal = activeEmployees.length;
  var activeIds = {};
  activeEmployees.forEach(function (emp) {
    activeIds[emp.id] = true;
  });

  var days = [];
  for (var i = ATTENDANCE_TREND_DAYS - 1; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var dateStr = Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd");
    var dayLabel = Utilities.formatDate(d, "Asia/Bangkok", "dd/MM");
    var doc = firestoreGetDocument_(FIRESTORE_ROOT_PATH + "/attendance/" + dateStr);
    var records = (doc && doc.records) || {};
    var present = 0;
    Object.keys(records).forEach(function (empId) {
      if (activeIds[empId] && records[empId].status === ATTENDANCE_PRESENT_STATUS) present++;
    });
    var rate = activeTotal > 0 ? present / activeTotal : 0;
    days.push({ date: dateStr, label: dayLabel, present: present, rate: rate });
  }

  var sparkline = days
    .map(function (d) {
      var idx = Math.min(SPARKLINE_BLOCKS.length - 1, Math.max(0, Math.round(d.rate * (SPARKLINE_BLOCKS.length - 1))));
      return SPARKLINE_BLOCKS[idx];
    })
    .join("");

  return { days: days, sparkline: sparkline };
}

/** เวอร์ชัน text ธรรมดา (เก็บไว้เผื่ออยากดู/ส่งแบบข้อความล้วน ผ่าน previewDailyReportMessage) */
function buildDailyReportMessage_() {
  var data = computeDailyDashboardData_();
  var genderCounts = data.genderCounts;
  var typeBreakdown = data.typeBreakdown;

  var lines = [];
  lines.push("📊 สรุป Dashboard CMG-HR-DATABASE");
  lines.push("วันที่ " + data.todayLabel);
  lines.push("------------------------------");
  lines.push("👥 พนักงานทำงานอยู่: " + data.activeTotal + " คน");
  lines.push("✅ มาทำงานวันนี้: " + data.presentCount + " คน");
  lines.push("❌ ขาด: " + data.absentCount + " คน");
  lines.push("🏖️ ลา: " + data.leaveCount + " คน");
  lines.push("🟡 เคสติดตามที่ยังเปิดอยู่: " + data.openFollowUps.length + " เคส");

  lines.push("------------------------------");
  lines.push(
    "🚻 เพศ: ชาย " +
      genderCounts["ชาย"] +
      " | หญิง " +
      genderCounts["หญิง"] +
      (genderCounts["ไม่ระบุ"] > 0 ? " | ไม่ระบุ " + genderCounts["ไม่ระบุ"] : "")
  );

  lines.push("------------------------------");
  lines.push("📋 สัดส่วนกำลังคน:");
  lines.push("   DC (รวม): " + typeBreakdown.dcTotal + " คน");
  lines.push("      - DC Thai: " + typeBreakdown.dcThai + " คน");
  lines.push("      - DC Foreigner: " + typeBreakdown.dcForeigner + " คน");
  if (typeBreakdown.dcUnknown > 0) {
    lines.push("      - DC ไม่ระบุสัญชาติ: " + typeBreakdown.dcUnknown + " คน");
  }
  lines.push("   Supply Thai: " + typeBreakdown.supplyThai + " คน");
  lines.push("   Supply Foreigner: " + typeBreakdown.supplyForeigner + " คน");
  if (typeBreakdown.supplyUnknown > 0) {
    lines.push("   Supply ไม่ระบุสัญชาติ: " + typeBreakdown.supplyUnknown + " คน");
  }

  var followUpText = buildFollowUpListText_(data);
  if (followUpText) {
    lines.push("------------------------------");
    lines.push(followUpText);
  }

  return lines.join("\n");
}

/** ข้อความ text รายการเคสติดตามที่ยังเปิดอยู่ (คืน null ถ้าไม่มีเคสเปิดเลย) ใช้กับเวอร์ชัน text ล้วนเท่านั้น */
function buildFollowUpListText_(data) {
  if (data.openFollowUps.length === 0) return null;
  var lines = [];
  lines.push("🟡 รายการเคสที่ต้องติดตาม (" + data.openFollowUps.length + " เคส, แสดงสูงสุด 10 รายการ):");
  data.openFollowUps.slice(0, 10).forEach(function (f, idx) {
    var name = f.employeeName || f["ชื่อพนักงาน"] || f.employeeId || f.id;
    lines.push(idx + 1 + ". " + name + " (" + f.status + ")");
  });
  return lines.join("\n");
}

/** เนื้อหา Flex (array ของ box/text) สำหรับรายชื่อเคสติดตามที่ยังเปิดอยู่ ฝังลงใน body ของการ์ดภาพรวมโดยตรง (คืน [] ถ้าไม่มีเคสเปิดเลย) */
function buildFollowUpFlexSection_(data) {
  if (data.openFollowUps.length === 0) return [];
  var maxShown = 5; // จำกัดจำนวนในการ์ดให้กระชับ (ไม่เหมือนเวอร์ชัน text ที่โชว์ได้ถึง 10)
  var contents = [
    { type: "separator", margin: "md" },
    flexSectionTitle_("🟡 เคสที่ต้องติดตาม (" + data.openFollowUps.length + ")", "#d97706"),
  ];
  data.openFollowUps.slice(0, maxShown).forEach(function (f) {
    var name = f.employeeName || f["ชื่อพนักงาน"] || f.employeeId || f.id;
    contents.push(flexSmallText_("• " + name + " (" + f.status + ")"));
  });
  var hiddenCount = data.openFollowUps.length - maxShown;
  if (hiddenCount > 0) {
    contents.push(flexSmallText_("... และอีก " + hiddenCount + " เคส", "#9ca3af"));
  }
  return contents;
}

/** สร้าง Flex card ภาพรวม Dashboard (1 bubble) จาก computeDailyDashboardData_() */
function buildDailyDashboardFlexMessage_(data) {
  var g = data.genderCounts;
  var t = data.typeBreakdown;

  var body = [
    flexStatRow_("พนักงานทำงานอยู่", data.activeTotal + " คน"),
    { type: "separator", margin: "md" },
    flexStatRow_("✅ มาทำงาน", data.presentCount + " คน", "#16a34a"),
    flexStatRow_("❌ ขาด", data.absentCount + " คน", data.absentCount > 0 ? "#dc2626" : undefined),
    flexStatRow_("🏖️ ลา", data.leaveCount + " คน", data.leaveCount > 0 ? "#d97706" : undefined),
    { type: "separator", margin: "md" },
    flexStatRow_(
      "🟡 เคสติดตามเปิดอยู่",
      data.openFollowUps.length + " เคส",
      data.openFollowUps.length > 0 ? "#d97706" : undefined
    ),
    { type: "separator", margin: "md" },
    flexSectionTitle_("🚻 เพศ", "#111827"),
    flexStatRow_("ชาย", g["ชาย"] + " คน"),
    flexStatRow_("หญิง", g["หญิง"] + " คน"),
  ];

  if (g["ไม่ระบุ"] > 0) {
    body.push(flexStatRow_("ไม่ระบุ", g["ไม่ระบุ"] + " คน"));
  }

  body.push({ type: "separator", margin: "md" });
  body.push(flexSectionTitle_("📋 สัดส่วนกำลังคน", "#111827"));
  body.push(flexStatRow_("DC รวม", t.dcTotal + " คน"));
  body.push(flexSmallText_("   ไทย " + t.dcThai + " / ตปท " + t.dcForeigner + (t.dcUnknown > 0 ? " / ไม่ระบุ " + t.dcUnknown : "")));
  body.push(flexStatRow_("Supply รวม", t.supplyTotal + " คน"));
  body.push(
    flexSmallText_(
      "   ไทย " + t.supplyThai + " / ตปท " + t.supplyForeigner + (t.supplyUnknown > 0 ? " / ไม่ระบุ " + t.supplyUnknown : "")
    )
  );

  // 📈 แนวโน้มมาทำงาน N วันล่าสุด (sparkline บรรทัดเดียว)
  var trend = data.trend;
  if (trend && trend.days.length > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push(flexSectionTitle_("📈 แนวโน้มมาทำงาน " + trend.days.length + " วันล่าสุด", "#111827"));
    body.push(flexSmallText_(trend.sparkline + "   " + trend.days[0].label + " → " + trend.days[trend.days.length - 1].label));
    body.push(
      flexSmallText_(
        "วันนี้มา " + Math.round(trend.days[trend.days.length - 1].rate * 100) + "%",
        "#6b7280"
      )
    );
  }

  // ⏱️ OT สะสมเดือนนี้ Top N คน (bar chart)
  var otBurden = data.otBurden;
  if (otBurden && otBurden.topEmployees.length > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push(
      flexSectionTitle_("⏱️ OT สะสมเดือนนี้ Top " + otBurden.topEmployees.length + " (" + otBurden.monthLabel + ")", "#111827")
    );
    otBurden.topEmployees.forEach(function (row) {
      var ratio = otBurden.maxHours > 0 ? row.hours / otBurden.maxHours : 0;
      body.push(buildFlexBarRow_(row.name, row.hours.toFixed(1) + " ชม.", ratio, getOtTierColor_(row.hours)));
    });
  }

  // รายชื่อเคสติดตามที่ยังเปิดอยู่ ฝังไว้ในการ์ดเดียวกันเลย (ไม่แยกส่งข้อความ text เพิ่ม เพื่อประหยัดโควต้า)
  buildFollowUpFlexSection_(data).forEach(function (item) {
    body.push(item);
  });

  return {
    type: "flex",
    altText: "📊 สรุป Dashboard CMG-HR-DATABASE วันที่ " + data.todayLabel,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2563eb",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "📊 สรุป Dashboard CMG-HR-DATABASE", color: "#ffffff", weight: "bold", size: "md", wrap: true },
          { type: "text", text: "วันที่ " + data.todayLabel, color: "#dbeafe", size: "xs", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: body,
      },
    },
  };
}

/** ========== คำนวณเพศ / ประเภทกำลังคน (DC / Supply / สัญชาติ) ========== */
/** ตรรกะเหล่านี้ copy มาจาก src/components/ManpowerDashboard.tsx ให้ตรงกับที่ Dashboard จริงใช้ */

function getEmployeeTypeRaw_(emp) {
  return String(emp.employee_type || "").toLowerCase().trim();
}

function getWorkGroupRaw_(emp) {
  return String(emp["สถานะกลุ่มงาน"] || "").toLowerCase().trim();
}

function normalizeEmployeeType_(emp) {
  var employeeTypeRaw = getEmployeeTypeRaw_(emp);
  var workGroupRaw = getWorkGroupRaw_(emp);

  if (employeeTypeRaw.indexOf("indirect") !== -1) return "Staff Monthly";
  if (employeeTypeRaw.indexOf("teamleader") !== -1) {
    if (workGroupRaw === "staff") return "DC Daily - Staff";
    if (workGroupRaw === "worker") return "DC Daily - Worker";
    return "DC Daily";
  }
  if (employeeTypeRaw.indexOf("supply") !== -1 || employeeTypeRaw.indexOf("supplydc") !== -1) return "Supply manpower";
  if (employeeTypeRaw.indexOf("sub") !== -1) return "Sub contractor";
  if (workGroupRaw === "staff") return "Staff Monthly";
  if (workGroupRaw.indexOf("supply") !== -1) return "Supply manpower";
  if (workGroupRaw.indexOf("sub") !== -1) return "Sub contractor";
  if (workGroupRaw.indexOf("worker") !== -1) return "Direct Worker";
  return "ไม่ระบุ";
}

function inferNationalityGroup_(emp) {
  var raw = String(emp["สัญชาติ"] || "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "ไทย" || raw === "thai" || raw === "th") return "thai";
  return "foreigner";
}

function isDcDailyType_(typeLabel) {
  return typeLabel.indexOf("DC Daily") === 0;
}

/** เหมือน Dashboard จริง: ไม่นับ "DC Daily - Staff" ในการคำนวณสัดส่วนกำลังคน */
function computeEmployeeTypeBreakdown_(employeeList) {
  var filtered = employeeList.filter(function (emp) {
    return normalizeEmployeeType_(emp) !== "DC Daily - Staff";
  });

  var dcThai = 0,
    dcForeigner = 0,
    dcUnknown = 0,
    supplyThai = 0,
    supplyForeigner = 0,
    supplyUnknown = 0,
    otherThai = 0,
    otherForeigner = 0,
    otherUnknown = 0;

  filtered.forEach(function (emp) {
    var typeLabel = normalizeEmployeeType_(emp);
    var nationality = inferNationalityGroup_(emp);
    var isDc = isDcDailyType_(typeLabel);
    var isSupply = typeLabel === "Supply manpower";

    if (isDc) {
      if (nationality === "thai") dcThai++;
      else if (nationality === "foreigner") dcForeigner++;
      else dcUnknown++;
    } else if (isSupply) {
      if (nationality === "thai") supplyThai++;
      else if (nationality === "foreigner") supplyForeigner++;
      else supplyUnknown++;
    } else {
      if (nationality === "thai") otherThai++;
      else if (nationality === "foreigner") otherForeigner++;
      else otherUnknown++;
    }
  });

  return {
    dcThai: dcThai,
    dcForeigner: dcForeigner,
    dcUnknown: dcUnknown,
    dcTotal: dcThai + dcForeigner + dcUnknown,
    supplyThai: supplyThai,
    supplyForeigner: supplyForeigner,
    supplyUnknown: supplyUnknown,
    supplyTotal: supplyThai + supplyForeigner + supplyUnknown,
    grandTotal: filtered.length,
  };
}

function inferGender_(emp) {
  var explicit = String(emp.gender || emp["เพศ"] || "").trim().toLowerCase();
  if (explicit === "male" || explicit === "ชาย" || explicit === "m") return "ชาย";
  if (explicit === "female" || explicit === "หญิง" || explicit === "f") return "หญิง";

  var title = String(emp["ชื่อต้น"] || "").trim().toLowerCase();
  if (title === "นาย" || title === "mr.") return "ชาย";
  if (title === "นาง" || title === "นางสาว" || title === "mrs." || title === "ms.") return "หญิง";
  return "ไม่ระบุ";
}

/** ========== รายงานแยกตามโครงการ (มา/ขาด/ลา) — ส่งเป็น Flex Carousel ========== */

var LINE_MAX_MESSAGES_PER_PUSH = 5; // LINE จำกัดสูงสุด 5 ข้อความต่อการ push 1 ครั้ง
var FLEX_MAX_BUBBLES_PER_CAROUSEL = 12; // LINE จำกัดสูงสุด 12 bubble ต่อ 1 carousel (= 1 ข้อความ)
var FLEX_MAX_NAMES_PER_SECTION = 8; // จำกัดจำนวนชื่อที่แสดงต่อการ์ด กันการ์ดยาวเกินไป (ที่เหลือจะสรุปเป็น "+N เพิ่มเติม")
var ATTENDANCE_LEAVE_STATUSES = { "ลา": "ลาเต็มวัน", "ลาครึ่งเช้า": "ลาครึ่งเช้า", "ลาครึ่งบ่าย": "ลาครึ่งบ่าย", "ลา½": "ลาครึ่งวัน" };
var ATTENDANCE_ABSENT_STATUS = "ไม่มา";
var ATTENDANCE_PRESENT_STATUS = "มา";
var NO_PROJECT_LABEL = "⚪ ไม่ระบุโครงการ";

/** สร้าง/คืนค่า bucket ของแผนกหนึ่งๆ ภายในโครงการ (เก็บ total/present/absent/leave/notRecorded + ชื่อตำแหน่งที่พบในแผนกนี้) */
function ensureProjectDepartmentBucket_(projectBucket, deptLabel) {
  if (!projectBucket.departments[deptLabel]) {
    projectBucket.departments[deptLabel] = {
      label: deptLabel,
      total: 0,
      present: 0,
      absent: 0,
      leave: 0,
      notRecorded: 0,
      positions: {}, // เก็บชื่อตำแหน่ง (ฟิลด์ "ตำแหน่ง") ที่พบในแผนกนี้ไว้นับจำนวนตำแหน่งที่แตกต่างกัน
    };
  }
  return projectBucket.departments[deptLabel];
}

/**
 * แปลง map แผนกดิบ -> array ของแผนกที่ "มีปัญหา" เท่านั้น (ขาด หรือ ลา > 0) เรียงจากปัญหาเยอะไปน้อย
 * ธงสำคัญ: isFullyAbsent = true เมื่อคนในแผนกนั้น "ขาด" ครบทุกคน (ไม่มีใครมาเลยสักคน)
 */
function buildDepartmentIssueList_(departmentsMap) {
  var list = Object.keys(departmentsMap).map(function (key) {
    var d = departmentsMap[key];
    return {
      label: d.label,
      total: d.total,
      present: d.present,
      absent: d.absent,
      leave: d.leave,
      positionCount: Object.keys(d.positions).length,
      isFullyAbsent: d.total > 0 && d.absent === d.total, // ขาดทั้งแผนก (ทุกคนในแผนกนี้ไม่มาเลยสักคน)
    };
  });

  var issues = list.filter(function (d) {
    return d.absent > 0 || d.leave > 0;
  });

  issues.sort(function (a, b) {
    // ขาดทั้งแผนกมาก่อนเสมอ แล้วค่อยเรียงตามจำนวนปัญหา (ขาด+ลา) มาก->น้อย
    if (a.isFullyAbsent !== b.isFullyAbsent) return a.isFullyAbsent ? -1 : 1;
    var aIssue = a.absent + a.leave;
    var bIssue = b.absent + b.leave;
    if (aIssue !== bIssue) return bIssue - aIssue;
    return a.label.localeCompare(b.label, "th");
  });

  return issues;
}

/**
 * ดึงข้อมูล + จัดกลุ่มตามโครงการ (ใช้ร่วมกันทั้งข้อความสรุปและ Flex Carousel)
 * คืนค่า { todayLabel, grandTotal, cleanProjectCount, problemProjects: [...] }
 * โดย problemProjects คือโครงการที่มีคนขาดหรือลาเท่านั้น (เรียงตามเลขโครงการแล้ว)
 */
function computeProjectAttendanceData_() {
  var employees = firestoreListDocuments_(FIRESTORE_ROOT_PATH + "/employee_data").filter(function (e) {
    return e["สถานะพนักงาน"] === ACTIVE_EMPLOYEE_STATUS_VALUE;
  });

  var todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  var todayLabel = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");

  var attendanceDoc = firestoreGetDocument_(FIRESTORE_ROOT_PATH + "/attendance/" + todayStr);
  var records = (attendanceDoc && attendanceDoc.records) || {};

  // จัดกลุ่มพนักงานตามโครงการหลัก (โครงการปัจจุบัน หรือรายการแรกใน สถานะโครงการ)
  var projects = {};

  employees.forEach(function (emp) {
    var projectLabel = getPrimaryProjectLabel_(emp);
    var key = projectSortKey_(projectLabel);

    if (!projects[key]) {
      projects[key] = {
        label: projectLabel,
        total: 0,
        present: 0,
        absent: 0,
        leave: 0,
        notRecorded: 0,
        absentNames: [], // แสดงชื่อเฉพาะกลุ่มงาน Staff เท่านั้น
        leaveNames: [], // แสดงชื่อเฉพาะกลุ่มงาน Staff เท่านั้น
        absentWorkerCount: 0, // แรงงาน (ไม่ใช่ Staff) ที่ขาด — นับจำนวนอย่างเดียว ไม่แสดงชื่อ
        leaveWorkerCount: 0, // แรงงาน (ไม่ใช่ Staff) ที่ลา — นับจำนวนอย่างเดียว ไม่แสดงชื่อ
        employees: [], // เก็บ raw employee object ไว้คำนวณสัดส่วน DC/Supply/สัญชาติทีหลัง
        departments: {}, // จัดกลุ่มตาม "แผนก" (เหมือนตาราง "ตำแหน่งหลักในโครงการ" บน Dashboard) ไว้เช็คว่าแผนกไหนขาดครบทั้งแผนก
      };
    }

    var bucket = projects[key];
    bucket.total += 1;
    bucket.employees.push(emp);

    var fullName = ((emp["ชื่อตัว"] || "") + " " + (emp["ชื่อสกุล"] || "")).trim() || emp["รหัสพนักงาน"] || emp.id;
    var position = String(emp["ตำแหน่ง"] || "").trim();
    var displayName = position ? fullName + " (" + position + ")" : fullName;
    var status = records[emp.id] && records[emp.id].status;
    // "ตำแหน่งหลักในโครงการ" = พนักงานกลุ่มงาน Staff เท่านั้นที่จะแสดงชื่อในรายงาน
    // ส่วนแรงงาน (worker/supply/sub) จะนับจำนวนรวมอย่างเดียว ไม่เปิดเผยชื่อ
    var isStaffGroup = getWorkGroupRaw_(emp) === "staff";

    // จัดกลุ่มตามแผนก (field "แผนก") + เก็บชื่อตำแหน่งที่แตกต่างกันไว้นับจำนวน (เหมือนตารางบน Dashboard จริง)
    var deptLabel = String(emp["แผนก"] || "").trim() || "ไม่ระบุแผนก";
    var deptBucket = ensureProjectDepartmentBucket_(bucket, deptLabel);
    deptBucket.total += 1;
    if (position) deptBucket.positions[position] = true;

    if (status === ATTENDANCE_PRESENT_STATUS) {
      bucket.present += 1;
      deptBucket.present += 1;
    } else if (status === ATTENDANCE_ABSENT_STATUS) {
      bucket.absent += 1;
      deptBucket.absent += 1;
      if (isStaffGroup) {
        bucket.absentNames.push(displayName);
      } else {
        bucket.absentWorkerCount += 1;
      }
    } else if (ATTENDANCE_LEAVE_STATUSES[status]) {
      bucket.leave += 1;
      deptBucket.leave += 1;
      if (isStaffGroup) {
        bucket.leaveNames.push(displayName + " - " + ATTENDANCE_LEAVE_STATUSES[status]);
      } else {
        bucket.leaveWorkerCount += 1;
      }
    } else {
      // รวม "H" (วันหยุดพนักงาน) และกรณียังไม่ได้บันทึกเช็คชื่อไว้ในหมวดเดียวกัน
      bucket.notRecorded += 1;
      deptBucket.notRecorded += 1;
    }
  });

  var sortedKeys = Object.keys(projects).sort(function (a, b) {
    // ให้ "ไม่ระบุโครงการ" ไปอยู่ท้ายสุดเสมอ
    if (a === "~zzz") return 1;
    if (b === "~zzz") return -1;
    return a.localeCompare(b);
  });

  var grandTotal = { total: 0, present: 0, absent: 0, leave: 0, notRecorded: 0 };
  var cleanProjectCount = 0; // โครงการที่มาครบทุกคน ไม่มีขาด/ลา (ถูกซ่อนไว้เพื่อประหยัดโควต้าข้อความ LINE)
  var problemProjects = [];

  sortedKeys.forEach(function (key) {
    var p = projects[key];
    grandTotal.total += p.total;
    grandTotal.present += p.present;
    grandTotal.absent += p.absent;
    grandTotal.leave += p.leave;
    grandTotal.notRecorded += p.notRecorded;

    // ประหยัดโควต้าข้อความ: แสดงเฉพาะโครงการที่มีคน "ขาด" หรือ "ลา" เท่านั้น
    if (p.absent === 0 && p.leave === 0) {
      cleanProjectCount += 1;
      return;
    }

    p.composition = computeEmployeeTypeBreakdown_(p.employees);
    delete p.employees; // ไม่ต้องใช้ต่อแล้ว ตัดทิ้งกันข้อมูลหนักโดยไม่จำเป็น

    p.departmentIssues = buildDepartmentIssueList_(p.departments);
    delete p.departments; // ไม่ต้องใช้ raw map ต่อแล้ว (แปลงเป็น departmentIssues เรียบร้อยแล้ว)

    problemProjects.push(p);
  });

  return {
    todayLabel: todayLabel,
    grandTotal: grandTotal,
    cleanProjectCount: cleanProjectCount,
    problemProjects: problemProjects,
  };
}

/** ข้อความสรุปภาพรวม (text ธรรมดา) ที่จะส่งนำหน้า Flex Carousel เสมอ */
function buildProjectAttendanceSummaryText_(data) {
  var g = data.grandTotal;
  var lines = [];
  lines.push("📊 รายงานประจำวัน " + data.todayLabel);
  lines.push("แยกตามโครงการ");
  lines.push("------------------------------");
  lines.push("✅ โครงการมาครบทุกคน: " + data.cleanProjectCount + " โครงการ");
  lines.push("🔎 โครงการที่มีคนขาด/ลา: " + data.problemProjects.length + " โครงการ");
  lines.push("------------------------------");
  lines.push(
    "รวมทั้งหมด: " +
      g.total +
      " คน | มา " +
      g.present +
      " | ขาด " +
      g.absent +
      " | ลา " +
      g.leave +
      (g.notRecorded > 0 ? " | ยังไม่บันทึก " + g.notRecorded : "")
  );
  if (data.problemProjects.length > 0) {
    lines.push("------------------------------");
    lines.push("👇 รายละเอียดโครงการที่มีปัญหา (เลื่อนดูการ์ดด้านล่าง)");
  }
  return lines.join("\n");
}

/**
 * สร้าง Flex Carousel จากโครงการที่มีปัญหา (problemProjects)
 * การ์ดใบแรกสุด (ของชุดแรก) คือ "การ์ดสรุปภาพรวม" (แทนที่ข้อความ text สรุปแยกต่างหากแบบเดิม
 * เพื่อประหยัดโควต้าข้อความ LINE — ปกติทั้งหมดจะเหลือแค่ 1 ข้อความ/วัน)
 * แบ่งเป็นหลาย carousel ถ้าเกิน FLEX_MAX_BUBBLES_PER_CAROUSEL ต่อชุด
 * คืนค่าเป็น array ของ LINE message object ชนิด "flex" พร้อมส่งเลย (คืน [] ถ้าไม่มีโครงการมีปัญหาเลย)
 */
function buildProjectAttendanceFlexMessages_(data) {
  var projects = data.problemProjects;
  if (projects.length === 0) return [];

  var allBubbles = [buildProjectSummaryBubble_(data)].concat(projects.map(buildProjectFlexBubble_));

  var chunks = [];
  for (var i = 0; i < allBubbles.length; i += FLEX_MAX_BUBBLES_PER_CAROUSEL) {
    chunks.push(allBubbles.slice(i, i + FLEX_MAX_BUBBLES_PER_CAROUSEL));
  }

  return chunks.map(function (chunk, idx) {
    var altText =
      "รายงานแยกตามโครงการ " +
      data.todayLabel +
      " - มีปัญหา " +
      projects.length +
      " โครงการ" +
      (chunks.length > 1 ? " (ชุดที่ " + (idx + 1) + "/" + chunks.length + ")" : "");

    return {
      type: "flex",
      altText: altText.length > 400 ? altText.slice(0, 397) + "..." : altText, // LINE จำกัด altText ไม่เกิน 400 ตัวอักษร
      contents: {
        type: "carousel",
        contents: chunk,
      },
    };
  });
}

/** การ์ดสรุปภาพรวม (ใบแรกสุดในชุด carousel) แทนที่ข้อความ text สรุปแยกต่างหากแบบเดิม */
function buildProjectSummaryBubble_(data) {
  var g = data.grandTotal;
  var body = [
    flexStatRow_("ทั้งหมด", g.total + " คน"),
    flexStatRow_("มา", g.present + " คน", "#16a34a"),
    flexStatRow_("ขาด", g.absent + " คน", g.absent > 0 ? "#dc2626" : undefined),
    flexStatRow_("ลา", g.leave + " คน", g.leave > 0 ? "#d97706" : undefined),
    { type: "separator", margin: "md" },
    flexStatRow_("✅ โครงการมาครบ", data.cleanProjectCount + " โครงการ"),
    flexStatRow_("🔎 โครงการมีปัญหา", data.problemProjects.length + " โครงการ", "#dc2626"),
  ];

  // 🏗️ เปรียบเทียบโครงการที่มีปัญหาเยอะสุด (bar chart) — Top 5 เรียงตาม ขาด+ลา มาก -> น้อย
  var topIssueProjects = data.problemProjects
    .map(function (p) {
      return { label: shortenProjectLabel_(p.label), issue: p.absent + p.leave };
    })
    .sort(function (a, b) {
      return b.issue - a.issue;
    })
    .slice(0, 5);

  if (topIssueProjects.length > 0) {
    var maxIssue = topIssueProjects[0].issue;
    body.push({ type: "separator", margin: "md" });
    body.push(flexSectionTitle_("🏗️ โครงการที่มีปัญหาเยอะสุด", "#111827"));
    topIssueProjects.forEach(function (row) {
      var ratio = maxIssue > 0 ? row.issue / maxIssue : 0;
      body.push(buildFlexBarRow_(row.label, row.issue + " คน", ratio, "#dc2626"));
    });
  }

  body.push({ type: "separator", margin: "md" });
  body.push(flexSmallText_("👉 เลื่อนดูการ์ดโครงการที่มีปัญหาทางขวา", "#6b7280"));

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#2563eb",
      paddingAll: "12px",
      contents: [
        { type: "text", text: "📊 สรุปภาพรวมรายวัน", color: "#ffffff", weight: "bold", size: "sm", wrap: true },
        { type: "text", text: "วันที่ " + data.todayLabel, color: "#dbeafe", size: "xxs", margin: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: body,
    },
  };
}

/** สร้าง 1 bubble (การ์ด) ของ 1 โครงการ */
function buildProjectFlexBubble_(p) {
  var headerColor = p.absent > 0 ? "#dc2626" : "#f59e0b"; // แดงถ้ามีคนขาด, ส้มถ้ามีแต่คนลา
  var c = p.composition || {};

  var body = [
    flexStatRow_("ทั้งหมด", p.total + " คน"),
    flexStatRow_("มา", p.present + " คน", "#16a34a"),
    flexStatRow_("ขาด", p.absent + " คน", p.absent > 0 ? "#dc2626" : undefined),
    flexStatRow_("ลา", p.leave + " คน", p.leave > 0 ? "#d97706" : undefined),
    { type: "separator", margin: "md" },
    flexSmallText_(
      "DC " + (c.dcTotal || 0) + " (ไทย " + (c.dcThai || 0) + " / ตปท " + (c.dcForeigner || 0) + ")"
    ),
    flexSmallText_(
      "Supply " + (c.supplyTotal || 0) + " (ไทย " + (c.supplyThai || 0) + " / ตปท " + (c.supplyForeigner || 0) + ")"
    ),
  ];

  if (p.absent > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push(flexSectionTitle_("❌ ขาดงาน (" + p.absent + ")", "#dc2626"));
    appendNameLines_(body, p.absentNames, p.absentWorkerCount);
  }

  if (p.leave > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push(flexSectionTitle_("🏖️ ลา (" + p.leave + ")", "#d97706"));
    appendNameLines_(body, p.leaveNames, p.leaveWorkerCount);
  }

  appendDepartmentIssueLines_(body, p.departmentIssues);

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerColor,
      paddingAll: "12px",
      contents: [
        { type: "text", text: "📁 " + p.label, color: "#ffffff", weight: "bold", size: "sm", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: body,
    },
  };
}

/** เพิ่มรายชื่อ (จำกัดจำนวน) + บรรทัดสรุปแรงงานที่ไม่แสดงชื่อ เข้าไปใน contents ของ bubble */
function appendNameLines_(contents, names, workerCount) {
  var shown = names.slice(0, FLEX_MAX_NAMES_PER_SECTION);
  shown.forEach(function (name) {
    contents.push(flexSmallText_("• " + name));
  });
  var hiddenCount = names.length - shown.length;
  if (hiddenCount > 0) {
    contents.push(flexSmallText_("... และอีก " + hiddenCount + " คน", "#9ca3af"));
  }
  if (workerCount > 0) {
    contents.push(flexSmallText_("+ แรงงาน " + workerCount + " คน (ไม่แสดงรายชื่อ)", "#9ca3af"));
  }
}

/**
 * เพิ่มส่วน "แผนก/ตำแหน่งที่มีปัญหา" เข้าไปใน contents ของ bubble โครงการ
 * ไฮไลต์แผนกที่ "ขาดครบทั้งแผนก" (ไม่มีใครมาเลยสักคน) ด้วยกรอบ/ข้อความสีแดงเด่นชัด
 * จำกัดแสดงสูงสุด 6 แผนกแรก (เรียงจากขาดครบทั้งแผนกมาก่อน แล้วค่อยปัญหาเยอะ->น้อย) กันการ์ดยาวเกินไป
 */
function appendDepartmentIssueLines_(contents, departmentIssues) {
  if (!departmentIssues || departmentIssues.length === 0) return;

  var maxShown = 6;
  var shown = departmentIssues.slice(0, maxShown);

  contents.push({ type: "separator", margin: "md" });
  contents.push(flexSectionTitle_("📌 แผนก/ตำแหน่งที่มีปัญหา", "#111827"));

  shown.forEach(function (d) {
    var posSuffix = d.positionCount > 0 ? " (" + d.positionCount + " ตำแหน่ง)" : "";
    if (d.isFullyAbsent) {
      // ขาดครบทั้งแผนก — ไม่มีใครมาทำงานเลยสักคนในแผนกนี้ ไฮไลต์เด่นเป็นพิเศษ
      contents.push(
        flexSmallText_("🔴 " + d.label + posSuffix + " — ขาดครบทั้งแผนก (" + d.absent + "/" + d.total + " คน)", "#dc2626")
      );
    } else {
      contents.push(flexSmallText_("• " + d.label + posSuffix + " — ทั้งหมด " + d.total + " คน", "#374151"));
      var parts = [];
      if (d.absent > 0) parts.push("ขาด " + d.absent);
      if (d.leave > 0) parts.push("ลา " + d.leave);
      contents.push(flexSmallText_("   " + parts.join(" | "), "#6b7280"));
    }
  });

  var hiddenCount = departmentIssues.length - shown.length;
  if (hiddenCount > 0) {
    contents.push(flexSmallText_("... และอีก " + hiddenCount + " แผนกที่มีปัญหา", "#9ca3af"));
  }
}

/** แถว label/value แบบ baseline (เช่น "มา    80 คน") */
function flexStatRow_(label, value, valueColor) {
  return {
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: label, size: "xs", color: "#6b7280", flex: 3 },
      { type: "text", text: value, size: "xs", weight: "bold", align: "end", flex: 4, color: valueColor || "#111827" },
    ],
  };
}

function flexSmallText_(text, color) {
  return { type: "text", text: text, size: "xxs", wrap: true, color: color || "#374151" };
}

function flexSectionTitle_(text, color) {
  return { type: "text", text: text, size: "xs", weight: "bold", color: color || "#111827", margin: "sm" };
}

/** ตัดชื่อโครงการให้เหลือแค่เลขโครงการ (ตัดส่วนหลัง " - " ทิ้ง) ใช้แสดงในกราฟแท่งที่พื้นที่จำกัด */
function shortenProjectLabel_(label) {
  var raw = String(label || "");
  var idx = raw.indexOf(" - ");
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

/** หา label โครงการหลักของพนักงาน 1 คน (ใช้ โครงการปัจจุบัน ก่อน ถ้าไม่มีใช้ตัวแรกใน สถานะโครงการ) */
function getPrimaryProjectLabel_(emp) {
  var current = String(emp["โครงการปัจจุบัน"] || "").trim();
  if (current) return current;

  var statusProjects = emp["สถานะโครงการ"];
  var list = Array.isArray(statusProjects) ? statusProjects : statusProjects ? [statusProjects] : [];
  var first = String(list[0] || "").trim();
  return first || NO_PROJECT_LABEL;
}

/** เอาไว้เรียงตามเลขโครงการ (ตัดส่วนก่อน " - " ออกมาเป็น key) เช่น "PRJ-2026-001 - สำนักงานใหญ่" -> "prj-2026-001" */
function projectSortKey_(projectLabel) {
  if (projectLabel === NO_PROJECT_LABEL) return "~zzz"; // ให้เรียงไปอยู่ท้ายสุดเสมอ
  var raw = String(projectLabel || "").trim();
  var idx = raw.indexOf(" - ");
  var key = idx >= 0 ? raw.slice(0, idx) : raw;
  return key.trim().toLowerCase();
}

/** ========== Webhook: ใช้หา groupId/userId ชั่วคราว ========== */

/**
 * Entry point ที่ LINE จะเรียกเมื่อมีข้อความ/อีเวนต์เกิดขึ้น (ต้อง Deploy เป็น Web App ก่อน)
 * เมื่อมีคนพิมพ์อะไรก็ตามในกลุ่ม บอทจะ "ตอบกลับทันที" ด้วย groupId ของกลุ่มนั้น
 *
 * ⚠️ หมายเหตุ: Apps Script Web App (`/exec`) จะตอบกลับด้วย HTTP 302 เสมอ
 * (redirect ไปยัง URL ชั่วคราวที่ script.googleusercontent.com) ซึ่งเป็นพฤติกรรม
 * มาตรฐานของ Apps Script ทุกตัว แก้จากการตั้งค่าไม่ได้ LINE จะตรวจสอบสถานะ HTTP
 * ตรงๆ โดยไม่ follow redirect จึงทำให้ Webhook Verify ไม่ผ่านเสมอ (302 Found)
 * ฟังก์ชันนี้จึงใช้งานไม่ได้จริงกับ LINE Webhook — เก็บไว้เป็นข้อมูลอ้างอิงเท่านั้น
 * ให้ใช้ https://webhook.site แทนในการหา groupId (ดูขั้นตอนที่ 2 ใน README.md)
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var events = body.events || [];

    events.forEach(function (event) {
      var info = describeLineSource_(event.source || {});
      Logger.log(info.label + " = " + info.id);

      // เก็บค่าล่าสุดไว้ดูทีหลังได้ด้วย (Project Settings > Script Properties)
      PropertiesService.getScriptProperties().setProperty(
        "LAST_WEBHOOK_SOURCE",
        info.label + " = " + info.id
      );

      // ตอบกลับเข้าแชทเลย ถ้ามี replyToken (ข้อความปกติจะมี, อีเวนต์ join/leave อาจไม่มี)
      if (event.replyToken) {
        sendLineReply_(event.replyToken, "🔎 " + info.label + ":\n" + info.id);
      }
    });
  } catch (err) {
    Logger.log("doPost error: " + err);
  }

  // ต้องตอบกลับ LINE เสมอ มิฉะนั้น LINE จะมองว่า webhook ล้มเหลว
  return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** เผื่อทดสอบเปิด URL ของ Web App ตรงๆ ใน browser */
function doGet(e) {
  return ContentService.createTextOutput("OK - webhook endpoint พร้อมใช้งาน");
}

function describeLineSource_(source) {
  if (source.type === "group") return { label: "Group ID", id: source.groupId };
  if (source.type === "room") return { label: "Room ID", id: source.roomId };
  if (source.type === "user") return { label: "User ID", id: source.userId };
  return { label: "Unknown source", id: JSON.stringify(source) };
}

function sendLineReply_(replyToken, text) {
  var token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties");

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: "text", text: text }],
    }),
    muteHttpExceptions: true,
  });
}

/** ========== LINE Messaging API ========== */

function sendLineMessage_(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  var groupId = props.getProperty("LINE_GROUP_ID");

  if (!token || !groupId) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_GROUP_ID ใน Script Properties"
    );
  }

  var payload = {
    to: groupId,
    messages: [
      {
        type: "text",
        text: text,
      },
    ],
  };

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("LINE push message failed (" + code + "): " + response.getContentText());
  }
}

/** แปลงข้อความ text ธรรมดาให้เป็น LINE message object (เผื่อใช้ร่วมกับ sendLinePushMessages_) */
function textMessage_(text) {
  return { type: "text", text: text };
}

/**
 * ส่ง LINE message object หลายชิ้น (text/flex/image ฯลฯ ผสมกันได้) โดยแบ่งเป็นหลายการเรียก push
 * ถ้าเกิน 5 ข้อความ/ครั้ง (ข้อจำกัดของ LINE Messaging API: ส่งได้สูงสุด 5 ข้อความต่อการ push 1 ครั้ง)
 *
 * ก่อนส่งจะเช็กโควต้ารายเดือนก่อนเสมอ (ดู MONTHLY_MESSAGE_LIMIT) ถ้าส่งแล้วจะเกินโควต้า
 * จะ**ไม่ส่ง**และ log คำเตือนไว้แทน (กัน error ทำให้ trigger ล้มเหลว)
 */
function sendLinePushMessages_(messageObjects) {
  if (!messageObjects || messageObjects.length === 0) return;

  var used = getUsedMessageQuota_();
  if (used + messageObjects.length > MONTHLY_MESSAGE_LIMIT) {
    Logger.log(
      "⚠️ ข้ามการส่งข้อความ (" +
        messageObjects.length +
        " ข้อความ) เพราะจะทำให้เกินโควต้ารายเดือนที่ตั้งไว้ " +
        MONTHLY_MESSAGE_LIMIT +
        " ข้อความ/เดือน (ตอนนี้ใช้ไปแล้ว " +
        used +
        " ข้อความ) — ปรับ MONTHLY_MESSAGE_LIMIT ใน Code.gs ได้ถ้าต้องการเพิ่ม"
    );
    return;
  }

  for (var i = 0; i < messageObjects.length; i += LINE_MAX_MESSAGES_PER_PUSH) {
    var batch = messageObjects.slice(i, i + LINE_MAX_MESSAGES_PER_PUSH);
    pushLineMessageBatch_(batch);
    incrementMessageQuota_(batch.length);
    // เว้นช่วงสั้นๆ ระหว่างการ push แต่ละรอบ กันโดน rate limit เวลามีหลายข้อความมากๆ
    if (i + LINE_MAX_MESSAGES_PER_PUSH < messageObjects.length) Utilities.sleep(500);
  }
}

/** ========== โควต้าข้อความรายเดือน (กันส่งเกินแพ็กเกจฟรีของ LINE OA) ========== */

var MONTHLY_MESSAGE_LIMIT = 300; // ปรับเลขนี้ได้ถ้าอยากตั้งเพดานใหม่ (เช่นปรับเป็น 200 ถ้าใช้แพ็กเกจฟรีปัจจุบันของ LINE)

/** คืนค่า Script Property key ของเดือนปัจจุบัน (เช่น "LINE_MSG_COUNT_202610") — ขึ้นเดือนใหม่จะเริ่มนับ 0 ใหม่อัตโนมัติ */
function getQuotaKey_() {
  return "LINE_MSG_COUNT_" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMM");
}

function getUsedMessageQuota_() {
  var val = PropertiesService.getScriptProperties().getProperty(getQuotaKey_());
  return val ? parseInt(val, 10) : 0;
}

function incrementMessageQuota_(count) {
  var props = PropertiesService.getScriptProperties();
  var key = getQuotaKey_();
  props.setProperty(key, String(getUsedMessageQuota_() + count));
}

/** รันฟังก์ชันนี้เองเพื่อเช็กว่าเดือนนี้ส่งไปแล้วกี่ข้อความ (ดูผลใน Execution log) */
function getMonthlyMessageUsage() {
  var used = getUsedMessageQuota_();
  Logger.log(
    "เดือนนี้ส่งไปแล้ว " + used + " / " + MONTHLY_MESSAGE_LIMIT + " ข้อความ (เหลือ " + (MONTHLY_MESSAGE_LIMIT - used) + " ข้อความ)"
  );
  return used;
}

/** รันฟังก์ชันนี้เองถ้าต้องการรีเซ็ตตัวนับของเดือนปัจจุบันกลับเป็น 0 (ปกติไม่จำเป็น เพราะขึ้นเดือนใหม่จะรีเซ็ตให้อัตโนมัติ) */
function resetMonthlyMessageQuota() {
  PropertiesService.getScriptProperties().deleteProperty(getQuotaKey_());
  Logger.log("รีเซ็ตตัวนับข้อความของเดือนนี้เรียบร้อยแล้ว");
}

function pushLineMessageBatch_(messageObjects) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  var groupId = props.getProperty("LINE_GROUP_ID");

  if (!token || !groupId) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_GROUP_ID ใน Script Properties"
    );
  }

  var payload = {
    to: groupId,
    messages: messageObjects,
  };

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("LINE push message (batch) failed (" + code + "): " + response.getContentText());
  }
}

/** ========== Firestore REST helpers ========== */

/**
 * ดึง "เอกสารเดี่ยว" 1 ชิ้นจาก Firestore (เช่น attendance/2026-10-08)
 * คืนค่าเป็น plain object ของ fields ถ้าพบ หรือ null ถ้าไม่พบเอกสาร (404)
 */
function firestoreGetDocument_(documentPath) {
  var projectId = PropertiesService.getScriptProperties().getProperty("FIRESTORE_PROJECT_ID");
  if (!projectId) throw new Error("ยังไม่ได้ตั้งค่า FIRESTORE_PROJECT_ID ใน Script Properties");

  var accessToken = getFirestoreAccessToken_();
  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    projectId +
    "/databases/(default)/documents/" +
    documentPath;

  var response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code === 404) return null; // ไม่มีเอกสารนี้ (เช่น วันนี้ยังไม่มีใครเช็คชื่อเลย)
  if (code !== 200) {
    throw new Error(
      "Firestore REST error (" + code + ") on " + documentPath + ": " + response.getContentText()
    );
  }

  var json = JSON.parse(response.getContentText());
  return parseFirestoreFields_(json.fields || {});
}

/**
 * ดึงเอกสารทั้งหมดใน collection (รองรับ pagination)
 * คืนค่าเป็น array ของ object ธรรมดา เช่น [{ id: "...", field1: "...", field2: 123 }, ...]
 */
function firestoreListDocuments_(collectionPath) {
  var projectId = PropertiesService.getScriptProperties().getProperty("FIRESTORE_PROJECT_ID");
  if (!projectId) throw new Error("ยังไม่ได้ตั้งค่า FIRESTORE_PROJECT_ID ใน Script Properties");

  var accessToken = getFirestoreAccessToken_();
  var baseUrl =
    "https://firestore.googleapis.com/v1/projects/" +
    projectId +
    "/databases/(default)/documents/" +
    collectionPath;

  var allDocs = [];
  var pageToken = null;

  do {
    var url = baseUrl + "?pageSize=300" + (pageToken ? "&pageToken=" + pageToken : "");
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { Authorization: "Bearer " + accessToken },
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    if (code !== 200) {
      throw new Error(
        "Firestore REST error (" + code + ") on " + collectionPath + ": " + response.getContentText()
      );
    }

    var json = JSON.parse(response.getContentText());
    var documents = json.documents || [];
    documents.forEach(function (doc) {
      var id = doc.name.split("/").pop();
      var parsed = parseFirestoreFields_(doc.fields || {});
      parsed.id = id;
      allDocs.push(parsed);
    });

    pageToken = json.nextPageToken || null;
  } while (pageToken);

  return allDocs;
}

/** แปลง Firestore "fields" object (typed values) ให้เป็น plain JS object */
function parseFirestoreFields_(fields) {
  var result = {};
  Object.keys(fields).forEach(function (key) {
    result[key] = parseFirestoreValue_(fields[key]);
  });
  return result;
}

function parseFirestoreValue_(value) {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.mapValue !== undefined) return parseFirestoreFields_(value.mapValue.fields || {});
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(parseFirestoreValue_);
  }
  return null;
}

/**
 * สร้าง OAuth2 access token จาก Service Account (JWT Bearer flow)
 * cache ไว้ 50 นาที เพื่อลดการเรียก token endpoint ซ้ำ
 */
function getFirestoreAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("firestore_access_token");
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientEmail = props.getProperty("SERVICE_ACCOUNT_EMAIL");
  var privateKey = props.getProperty("SERVICE_ACCOUNT_PRIVATE_KEY");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SERVICE_ACCOUNT_EMAIL หรือ SERVICE_ACCOUNT_PRIVATE_KEY ใน Script Properties"
    );
  }
  privateKey = normalizePrivateKey_(privateKey);

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: "RS256", typ: "JWT" };
  var claimSet = {
    iss: clientEmail,
    // หมายเหตุ: Firestore/Datastore API ไม่มี scope ".readonly" แยกต่างหาก
    // ต้องใช้ scope เต็ม "datastore" แล้วควบคุมสิทธิ์จริงด้วย IAM Role ของ Service Account แทน
    // (เช่นให้ role "Cloud Datastore Viewer" ก็จะอ่านได้อย่างเดียวแม้ scope จะกว้างก็ตาม)
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  var toSign =
    base64UrlEncode_(JSON.stringify(header)) + "." + base64UrlEncode_(JSON.stringify(claimSet));
  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, privateKey);
  var jwt = toSign + "." + base64UrlEncodeBytes_(signatureBytes);

  var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("ขอ access token ไม่สำเร็จ (" + code + "): " + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());
  cache.put("firestore_access_token", json.access_token, 50 * 60); // cache 50 นาที
  return json.access_token;
}

/**
 * ทำให้ private key ที่วางมาจาก Script Properties อยู่ในรูปแบบ PEM ที่ถูกต้องเสมอ
 * รองรับทั้งกรณีที่:
 *  - วางมาเป็นก้อนเดียวมี "\n" เป็นตัวอักษร 2 ตัว (backslash+n) ตามที่อยู่ใน JSON ดิบ
 *  - วางมาพร้อม newline จริงอยู่แล้ว (คัดลอกจาก editor ที่ render ให้)
 *  - มีเครื่องหมายคำพูด (" หรือ ') ติดหัวท้ายมาด้วยโดยไม่ตั้งใจ
 */
function normalizePrivateKey_(rawKey) {
  var key = String(rawKey).trim();

  // ตัดเครื่องหมายคำพูดที่อาจติดหัวท้ายมา (เช่น copy ทั้ง "..." จาก JSON)
  if (
    (key.charAt(0) === '"' && key.charAt(key.length - 1) === '"') ||
    (key.charAt(0) === "'" && key.charAt(key.length - 1) === "'")
  ) {
    key = key.slice(1, -1);
  }

  // แปลง literal "\n" (backslash + n) ให้เป็น newline จริง
  key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");

  key = key.trim();

  if (key.indexOf("BEGIN PRIVATE KEY") === -1 || key.indexOf("END PRIVATE KEY") === -1) {
    throw new Error(
      "SERVICE_ACCOUNT_PRIVATE_KEY ดูไม่เหมือน PEM key ที่ถูกต้อง " +
        "(ต้องมีบรรทัด -----BEGIN PRIVATE KEY----- และ -----END PRIVATE KEY----- รวมอยู่ด้วย) " +
        "กรุณาคัดลอกค่า private_key ทั้งก้อนจากไฟล์ JSON ของ Service Account มาวางใหม่ " +
        "(ดูวิธีละเอียดใน README.md หัวข้อ 'แก้ปัญหา Invalid argument: key')"
    );
  }

  return key;
}

/** รันฟังก์ชันนี้เองเพื่อตรวจสอบว่า private key ที่ตั้งไว้มีรูปแบบถูกต้องหรือไม่ (ไม่เปิดเผยคีย์เต็ม) */
function debugCheckServiceAccountKey() {
  var raw = PropertiesService.getScriptProperties().getProperty("SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!raw) {
    Logger.log("ยังไม่ได้ตั้งค่า SERVICE_ACCOUNT_PRIVATE_KEY เลย");
    return;
  }
  Logger.log("ความยาวค่าดิบ (raw length): " + raw.length);
  Logger.log("ขึ้นต้นด้วย: " + raw.substring(0, 35));
  Logger.log("ลงท้ายด้วย: " + raw.substring(raw.length - 35));
  Logger.log("มี literal \\n (backslash-n) กี่จุด: " + (raw.match(/\\n/g) || []).length);
  Logger.log("มี newline จริงกี่จุด: " + (raw.match(/\n/g) || []).length);

  try {
    var normalized = normalizePrivateKey_(raw);
    Logger.log("✅ normalize สำเร็จ ความยาวหลัง normalize: " + normalized.length);
    Logger.log("จำนวนบรรทัดหลัง normalize: " + normalized.split("\n").length);
    // ลองเซ็นจริงเพื่อยืนยันว่า Apps Script อ่านคีย์นี้ได้
    Utilities.computeRsaSha256Signature("test", normalized);
    Logger.log("✅ Utilities.computeRsaSha256Signature ใช้คีย์นี้เซ็นได้สำเร็จ ไม่มีปัญหา");
  } catch (err) {
    Logger.log("❌ ยังมีปัญหา: " + err);
  }
}

function base64UrlEncode_(str) {
  return base64UrlEncodeBytes_(Utilities.newBlob(str).getBytes());
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

/** ========== Trigger setup helper (รันครั้งเดียวจาก Editor เพื่อสร้าง trigger รายวัน) ========== */

var DAILY_REPORT_HOUR = 10; // ส่งรายงานตอน 10:00 น. (เวลาไทย) ปรับเลขนี้ถ้าต้องการเปลี่ยนเวลา

function createDailyTrigger() {
  createHourlyTriggerFor_("sendDailyDashboardReport", DAILY_REPORT_HOUR);
}

/** ตั้งเวลาส่งรายงานแยกตามโครงการให้อัตโนมัติด้วยเช่นกัน (เวลาเดียวกับรายงานภาพรวม) */
function createProjectAttendanceTrigger() {
  createHourlyTriggerFor_("sendProjectAttendanceReport", DAILY_REPORT_HOUR);
}

/** รันฟังก์ชันนี้ครั้งเดียวเพื่อตั้งเวลาส่งอัตโนมัติทั้ง 2 รายงานพร้อมกัน */
function createAllDailyTriggers() {
  createDailyTrigger();
  createProjectAttendanceTrigger();
}

function createHourlyTriggerFor_(functionName, hour) {
  // ลบ trigger เดิมของฟังก์ชันนี้ก่อน กันซ้ำ
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .inTimezone("Asia/Bangkok")
    .create();

  Logger.log("ตั้ง trigger " + functionName + " เวลา " + hour + ":00 (Asia/Bangkok) เรียบร้อยแล้ว");
}
