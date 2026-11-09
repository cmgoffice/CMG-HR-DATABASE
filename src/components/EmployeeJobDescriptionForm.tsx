import React, { useState } from "react";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  buildEmployeeJobDescriptionDocId,
  JOB_DESCRIPTIONS_COLLECTION,
  JobDescription,
  migrateResponsibilityStakeholders,
  normalizeJobTitle,
  RaciValue,
  RACI_CHIP_CLASS,
  ResponsibilityRow,
  SKILL_CATEGORY_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  SkillMatrixRow,
  sortStakeholderEntries,
  StakeholderRaciEntry,
  STAKEHOLDER_OPTIONS,
  toRaciAssignments,
} from "./jobDescriptionConfig";

const inputCls = "border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 w-full";
const labelCls = "text-xs font-semibold text-gray-600";

const RACI_OPTIONS: { value: RaciValue; label: string }[] = [
  { value: "R", label: "R - Responsible" },
  { value: "A", label: "A - Accountable" },
  { value: "C", label: "C - Consulted" },
  { value: "I", label: "I - Informed" },
];

// 1 หน้าที่มีได้หลายคนหลายบทบาทพร้อมกัน แต่ละคนมีตัวอักษร RACI ของตัวเอง เช่น
// "R ผู้ช่วยสำรวจ · A วิศวกรสำรวจ · C วิศวกรหน้างาน · I หัวหน้าควบคุมงาน" — เพิ่มทีละคู่ "บทบาท + ชื่อ"
// โชว์เป็น chip สีตามบทบาท ลบทีละรายการได้ ชื่อเลือกจากลิสต์เดิม (STAKEHOLDER_OPTIONS) หรือพิมพ์เองก็ได้
const ResponsibilityStakeholderEditor: React.FC<{
  rowIndex: number;
  entries: StakeholderRaciEntry[];
  onChange: (next: StakeholderRaciEntry[]) => void;
}> = ({ rowIndex, entries, onChange }) => {
  const [pendingRaci, setPendingRaci] = useState<RaciValue>("R");
  const [pendingName, setPendingName] = useState("");
  const datalistId = `stakeholder-options-${rowIndex}`;

  const addEntry = () => {
    const name = pendingName.trim();
    if (!name) return;
    onChange([...entries, { raci: pendingRaci, name }]);
    setPendingName("");
  };

  const removeEntry = (removeIdx: number) => onChange(entries.filter((_, i) => i !== removeIdx));

  return (
    <div className="flex flex-col gap-1.5">
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sortStakeholderEntries(entries).map((entry, i) => {
            // หา index จริงใน entries เดิม (ไม่ใช่ลำดับหลัง sort) ไว้ลบให้ถูกตัว
            const realIdx = entries.indexOf(entry);
            return (
              <span
                key={`${entry.raci}-${entry.name}-${i}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  RACI_CHIP_CLASS[entry.raci] || RACI_CHIP_CLASS.I
                }`}
              >
                {entry.raci} {entry.name}
                <button type="button" onClick={() => removeEntry(realIdx)} className="hover:opacity-60">
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <select
          value={pendingRaci}
          onChange={(e) => setPendingRaci(e.target.value as RaciValue)}
          className="border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-100 shrink-0"
        >
          {RACI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.value}</option>
          ))}
        </select>
        <input
          list={datalistId}
          value={pendingName}
          onChange={(e) => setPendingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
          placeholder="พิมพ์/เลือกชื่อบทบาท เช่น วิศวกรสำรวจ"
          className="border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-100 flex-1"
        />
        <datalist id={datalistId}>
          {STAKEHOLDER_OPTIONS.map((o) => (<option key={o} value={o} />))}
        </datalist>
        <button type="button" onClick={addEntry} className="flex items-center gap-1 px-2 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 shrink-0">
          <Plus size={12} /> เพิ่ม
        </button>
      </div>
    </div>
  );
};

interface Props {
  employeeCode: string;
  existingDoc: JobDescription | null;
  onClose: () => void;
}

export const EmployeeJobDescriptionForm: React.FC<Props> = ({ employeeCode, existingDoc, onClose }) => {
  const { firebaseUser, userProfile } = useAuth();
  const [saving, setSaving] = useState<"draft" | "issued" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ส่วนที่ 1 — ข้อมูลตำแหน่ง
  const [jobTitle, setJobTitle] = useState(existingDoc?.jobTitle || "");
  const [jobCode, setJobCode] = useState(existingDoc?.jobCode || "");
  const [department, setDepartment] = useState(existingDoc?.department || "");
  const [jobLevel, setJobLevel] = useState(existingDoc?.jobLevel || "");
  const [reportsTo, setReportsTo] = useState(existingDoc?.reportsTo || "");
  const [preparedDate, setPreparedDate] = useState(existingDoc?.preparedDate || "");
  const [jobPurpose, setJobPurpose] = useState(existingDoc?.jobPurpose || "");
  const [scopeNote, setScopeNote] = useState(existingDoc?.scopeNote || "");

  // ส่วนที่ 2 — หน้าที่ + Job Matrix (RACI)
  // migrate ให้เป็นรูปแบบใหม่ (StakeholderRaciEntry[]) เสมอตั้งแต่โหลดฟอร์ม เผื่อเอกสารเดิมยังเป็นรูปแบบเก่า
  // (RACI เดียวต่อหน้าที่ + รายชื่อไม่มีบทบาทกำกับ) — ไม่ทำลายข้อมูลเดิม แค่แปะบทบาทเดิมให้ทุกคนก่อน
  const [responsibilities, setResponsibilities] = useState<ResponsibilityRow[]>(
    existingDoc?.responsibilities?.length
      ? existingDoc.responsibilities.map((r) => ({ id: r.id, task: r.task, kpi: r.kpi, stakeholders: migrateResponsibilityStakeholders(r) }))
      : [{ task: "", kpi: "", stakeholders: [] }]
  );

  // ส่วนที่ 3 — คุณสมบัติผู้ดำรงตำแหน่ง
  const [education, setEducation] = useState(existingDoc?.education || "");
  const [experience, setExperience] = useState(existingDoc?.experience || "");
  const [knowledgeSkills, setKnowledgeSkills] = useState(existingDoc?.knowledgeSkills || "");
  const [additionalQualifications, setAdditionalQualifications] = useState(existingDoc?.additionalQualifications || "");

  // ส่วนที่ 4 — Skill Matrix
  const [skillMatrix, setSkillMatrix] = useState<SkillMatrixRow[]>(
    existingDoc?.skillMatrix?.length
      ? existingDoc.skillMatrix
      : [{ category: SKILL_CATEGORY_OPTIONS[0], skill: "", expectedLevel: 2, actualLevel: 2, idpMethod: "", aiSuggested: false }]
  );

  // ผู้ลงนาม
  const [employeeName, setEmployeeName] = useState(existingDoc?.employeeName || "");
  const [preparerName, setPreparerName] = useState(existingDoc?.preparerName || "");
  const [approverName, setApproverName] = useState(existingDoc?.approverName || "");
  const [acknowledgerName, setAcknowledgerName] = useState(existingDoc?.acknowledgerName || "");

  const updateResponsibility = (idx: number, patch: Partial<ResponsibilityRow>) =>
    setResponsibilities((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const updateSkill = (idx: number, patch: Partial<SkillMatrixRow>) =>
    setSkillMatrix((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const handleSave = async (status: "draft" | "issued") => {
    if (!jobTitle.trim()) {
      setFormError("กรุณากรอกตำแหน่งงาน (jobTitle)");
      return;
    }
    setSaving(status);
    setFormError(null);
    try {
      const db = getFirestore();
      const docId = existingDoc?.id || buildEmployeeJobDescriptionDocId(employeeCode);
      const userName = `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim();

      const payload: Record<string, unknown> = {
        jobTitle: jobTitle.trim(),
        jobTitleNormalized: normalizeJobTitle(jobTitle),
        jobCode: jobCode.trim(),
        department: department.trim(),
        jobLevel: jobLevel.trim(),
        reportsTo: reportsTo.trim(),
        preparedDate,
        jobPurpose: jobPurpose.trim(),
        scopeNote: scopeNote.trim(),
        // เขียนเป็น raciAssignments (field ชื่อเดียวกับที่ระบบสรรหาใช้จริง) แทน stakeholders เดิม
        // เพื่อให้ RACI รายคนที่บันทึกจากฟอร์มนี้ไปปรากฏถูก field เดียวกับที่ทั้งสองฝั่งอ่าน/merge ร่วมกัน
        responsibilities: responsibilities
          .filter((r) => (r.task || "").trim())
          .map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            task: (r.task || "").trim(),
            kpi: (r.kpi || "").trim(),
            raciAssignments: toRaciAssignments((r.stakeholders as StakeholderRaciEntry[]) || []),
          })),
        education: education.trim(),
        experience: experience.trim(),
        knowledgeSkills: knowledgeSkills.trim(),
        additionalQualifications: additionalQualifications.trim(),
        skillMatrix: skillMatrix.filter((s) => (s.skill || "").trim()),
        employeeName: employeeName.trim(),
        preparerName: preparerName.trim(),
        approverName: approverName.trim(),
        acknowledgerName: acknowledgerName.trim(),
        status,
        // เอกสารใหม่ (ยังไม่มี existingDoc) เท่านั้นที่ตั้ง source/employeeCode/hiringPacketId — ถ้าแก้ของเดิม
        // (ไม่ว่าจะมาจากระบบสรรหาหรือ Data สร้างเอง) ไม่แตะ field เหล่านี้ เพื่อให้รู้ที่มาแรกเริ่มเสมอ
        ...(existingDoc
          ? {}
          : { source: "data_team_manual", employeeCode, hiringPacketId: null }),
        updatedAt: serverTimestamp(),
        updatedByName: userName,
        updatedByUid: firebaseUser?.uid || "",
        // ใช้เทียบกับ syncedAt ฝั่งสรรหา เพื่อเตือน conflict ถ้ามีการซิงค์ใหม่ทับหลังจากนี้
        dataTeamEditedAt: serverTimestamp(),
        dataTeamEditedByName: userName,
        dataTeamEditedByUid: firebaseUser?.uid || "",
        ...(status === "issued" ? { issuedAt: serverTimestamp(), issuedByName: userName } : {}),
      };

      await setDoc(doc(db, "CMG-HR-Database", "root", JOB_DESCRIPTIONS_COLLECTION, docId), payload, { merge: true });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{existingDoc ? "แก้ไข JD" : "เพิ่ม JD"}</h3>
            <p className="text-xs text-gray-500 mt-1">รหัสพนักงาน: {employeeCode}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-auto flex-1 flex flex-col gap-5">
          {/* ส่วนที่ 1 */}
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-gray-700">1) ข้อมูลตำแหน่ง</h4>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className={labelCls}>ตำแหน่ง (jobTitle) *</span><input className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>รหัสตำแหน่ง (jobCode)</span><input className={inputCls} value={jobCode} onChange={(e) => setJobCode(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>แผนก</span><input className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>ระดับตำแหน่ง (jobLevel)</span><input className={inputCls} value={jobLevel} onChange={(e) => setJobLevel(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>รายงานต่อ (reportsTo)</span><input className={inputCls} value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>วันที่จัดทำ</span><input type="date" className={inputCls} value={preparedDate} onChange={(e) => setPreparedDate(e.target.value)} /></label>
            </div>
            <label className="flex flex-col gap-1"><span className={labelCls}>วัตถุประสงค์ของตำแหน่ง (jobPurpose)</span><textarea rows={2} className={inputCls} value={jobPurpose} onChange={(e) => setJobPurpose(e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>ขอบเขตงาน (scopeNote)</span><textarea rows={2} className={inputCls} value={scopeNote} onChange={(e) => setScopeNote(e.target.value)} /></label>
          </section>

          {/* ส่วนที่ 2 */}
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-gray-700">2) หน้าที่ + Job Matrix (RACI)</h4>
            {responsibilities.map((r, idx) => (
              <div key={idx} className="border rounded-lg p-3 flex flex-col gap-2 bg-gray-50">
                <div className="flex items-start gap-2">
                  <textarea rows={2} placeholder="งานที่รับผิดชอบ (task)" className={`${inputCls} flex-1`} value={r.task || ""} onChange={(e) => updateResponsibility(idx, { task: e.target.value })} />
                  <button type="button" onClick={() => setResponsibilities((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 p-1 shrink-0"><Trash2 size={15} /></button>
                </div>
                <input placeholder="KPI" className={inputCls} value={r.kpi || ""} onChange={(e) => updateResponsibility(idx, { kpi: e.target.value })} />
                <div>
                  <span className={`${labelCls} block mb-1`}>ผู้เกี่ยวข้อง + บทบาท (RACI ต่อคน)</span>
                  <ResponsibilityStakeholderEditor
                    rowIndex={idx}
                    entries={(r.stakeholders as StakeholderRaciEntry[]) || []}
                    onChange={(next) => updateResponsibility(idx, { stakeholders: next })}
                  />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setResponsibilities((prev) => [...prev, { task: "", kpi: "", stakeholders: [] }])} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline self-start">
              <Plus size={13} /> เพิ่มแถวหน้าที่งาน
            </button>
          </section>

          {/* ส่วนที่ 3 */}
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-gray-700">3) คุณสมบัติผู้ดำรงตำแหน่ง</h4>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className={labelCls}>การศึกษา (education)</span><input className={inputCls} value={education} onChange={(e) => setEducation(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>ประสบการณ์ (experience)</span><input className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value)} /></label>
            </div>
            <label className="flex flex-col gap-1"><span className={labelCls}>ความรู้/ทักษะ (knowledgeSkills)</span><textarea rows={2} className={inputCls} value={knowledgeSkills} onChange={(e) => setKnowledgeSkills(e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>คุณสมบัติเพิ่มเติม</span><textarea rows={2} className={inputCls} value={additionalQualifications} onChange={(e) => setAdditionalQualifications(e.target.value)} /></label>
          </section>

          {/* ส่วนที่ 4 */}
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-gray-700">4) Skill Matrix</h4>
            {skillMatrix.map((s, idx) => (
              <div key={idx} className="border rounded-lg p-3 flex flex-col gap-2 bg-gray-50">
                <div className="flex items-start gap-2">
                  <textarea rows={2} placeholder="ชื่อทักษะ (skill)" className={`${inputCls} flex-1`} value={s.skill || ""} onChange={(e) => updateSkill(idx, { skill: e.target.value })} />
                  <button type="button" onClick={() => setSkillMatrix((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 p-1 shrink-0"><Trash2 size={15} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputCls} value={s.category || SKILL_CATEGORY_OPTIONS[0]} onChange={(e) => updateSkill(idx, { category: e.target.value })}>
                    {SKILL_CATEGORY_OPTIONS.map((c) => (<option key={c} value={c}>{c.split("\n")[0]}</option>))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={!!s.aiSuggested} onChange={(e) => updateSkill(idx, { aiSuggested: e.target.checked })} /> AI ช่วยร่าง (ยังไม่ยืนยัน)
                  </label>
                  <select className={inputCls} value={s.expectedLevel ?? 2} onChange={(e) => updateSkill(idx, { expectedLevel: Number(e.target.value) })}>
                    {SKILL_LEVEL_OPTIONS.map((o) => (<option key={o.value} value={o.value}>คาดหวัง: {o.label}</option>))}
                  </select>
                  <select className={inputCls} value={s.actualLevel ?? 2} onChange={(e) => updateSkill(idx, { actualLevel: Number(e.target.value) })}>
                    {SKILL_LEVEL_OPTIONS.map((o) => (<option key={o.value} value={o.value}>ปัจจุบัน: {o.label}</option>))}
                  </select>
                </div>
                <textarea rows={2} placeholder="แนวทางพัฒนา (idpMethod)" className={inputCls} value={s.idpMethod || ""} onChange={(e) => updateSkill(idx, { idpMethod: e.target.value })} />
              </div>
            ))}
            <button type="button" onClick={() => setSkillMatrix((prev) => [...prev, { category: SKILL_CATEGORY_OPTIONS[0], skill: "", expectedLevel: 2, actualLevel: 2, idpMethod: "", aiSuggested: false }])} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline self-start">
              <Plus size={13} /> เพิ่มแถวทักษะ
            </button>
          </section>

          {/* ผู้ลงนาม */}
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-gray-700">ผู้ลงนาม</h4>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className={labelCls}>พนักงาน</span><input className={inputCls} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>ผู้จัดทำ</span><input className={inputCls} value={preparerName} onChange={(e) => setPreparerName(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>ผู้อนุมัติ</span><input className={inputCls} value={approverName} onChange={(e) => setApproverName(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>ผู้รับทราบ</span><input className={inputCls} value={acknowledgerName} onChange={(e) => setAcknowledgerName(e.target.value)} /></label>
            </div>
          </section>

          {formError && <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{formError}</div>}
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:underline px-3 py-2">ยกเลิก</button>
          <button type="button" disabled={!!saving} onClick={() => handleSave("draft")} className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 disabled:opacity-50">
            {saving === "draft" && <Loader2 className="animate-spin" size={14} />} บันทึกร่าง
          </button>
          <button type="button" disabled={!!saving} onClick={() => handleSave("issued")} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving === "issued" && <Loader2 className="animate-spin" size={14} />} ยืนยันใช้งานจริง
          </button>
        </div>
      </div>
    </div>
  );
};
