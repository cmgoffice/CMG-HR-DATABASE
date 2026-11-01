import React, { useMemo, useState } from "react";
import { doc, getFirestore, updateDoc } from "firebase/firestore";
import { Check, FileCheck2, FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addCustomDocumentType,
  removeDefaultDocumentTemplate,
  removeDocumentType,
  renameDocumentType,
  setDefaultDocumentTemplate,
  useDefaultDocumentTemplates,
  useDocumentTypeCatalog,
} from "./documentTypeCatalog";
import {
  normalizeProjectDocumentRequirements,
  PROJECT_DOCUMENT_APPLIES_TO_OPTIONS,
  PROJECT_ISSUES_OWN_ACCESS_BADGE_FIELD,
  PROJECT_REQUIRED_DOCUMENTS_FIELD,
  ProjectDocumentAppliesTo,
  ProjectDocumentRequirement,
  resolveDocumentTemplate,
} from "./projectDocumentConfig";

/** สร้าง id กลุ่มทางเลือกแบบสุ่ม (ใช้แค่จับคู่รายการที่เลือกแทนกันได้ในโครงการเดียวกัน ไม่ต้อง unique ข้ามระบบ) */
const generateAltGroupId = () => `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
import {
  removeProjectDocumentTemplate,
  uploadProjectDocumentTemplate,
} from "../utils/projectDocumentTemplateStorage";

interface ProjectRow {
  id: string;
  project_no?: string;
  project_name?: string;
  [key: string]: unknown;
}

export const ProjectDocumentRequirementsModal = ({
  project,
  onClose,
}: {
  project: ProjectRow;
  onClose: () => void;
}) => {
  const catalog = useDocumentTypeCatalog();
  const defaultTemplates = useDefaultDocumentTemplates();
  const [requirements, setRequirements] = useState<ProjectDocumentRequirement[]>(() =>
    normalizeProjectDocumentRequirements(project[PROJECT_REQUIRED_DOCUMENTS_FIELD])
  );
  const [issuesOwnAccessBadge, setIssuesOwnAccessBadge] = useState<boolean>(
    !!project[PROJECT_ISSUES_OWN_ACCESS_BADGE_FIELD]
  );
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [busyValue, setBusyValue] = useState<string | null>(null);
  const [templateBusyValue, setTemplateBusyValue] = useState<string | null>(null);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [groupSelection, setGroupSelection] = useState<Set<string>>(new Set());

  const selectedDocTypes = useMemo(() => new Set(requirements.map((r) => r.docType)), [requirements]);

  // กลุ่มทางเลือกที่ตั้งไว้แล้ว (altGroupId เดียวกัน = เลือกอย่างใดอย่างหนึ่งก็พอ เช่น ประกันสังคม/ประกันอุบัติเหตุ/ประกันกลุ่ม)
  const existingGroups = useMemo(() => {
    const map = new Map<string, ProjectDocumentRequirement[]>();
    requirements.forEach((r) => {
      if (!r.altGroupId) return;
      const arr = map.get(r.altGroupId) || [];
      arr.push(r);
      map.set(r.altGroupId, arr);
    });
    return Array.from(map.entries());
  }, [requirements]);

  const toggleGroupSelection = (docType: string) => {
    setGroupSelection((prev) => {
      const next = new Set(prev);
      if (next.has(docType)) next.delete(docType);
      else next.add(docType);
      return next;
    });
  };

  const handleCreateGroup = () => {
    if (groupSelection.size < 2) return;
    const groupId = generateAltGroupId();
    setRequirements((prev) => prev.map((r) => (groupSelection.has(r.docType) ? { ...r, altGroupId: groupId } : r)));
    setGroupSelection(new Set());
    setGroupPanelOpen(false);
  };

  const handleUngroup = (groupId: string) => {
    setRequirements((prev) => prev.map((r) => (r.altGroupId === groupId ? { ...r, altGroupId: undefined } : r)));
  };

  const toggleType = (docType: string, label: string) => {
    setRequirements((prev) => {
      if (prev.some((r) => r.docType === docType)) {
        return prev.filter((r) => r.docType !== docType);
      }
      return [...prev, { docType, label, appliesTo: "all" as ProjectDocumentAppliesTo }];
    });
  };

  const updateAppliesTo = (docType: string, appliesTo: ProjectDocumentAppliesTo) => {
    setRequirements((prev) => prev.map((r) => (r.docType === docType ? { ...r, appliesTo } : r)));
  };

  const toggleFulfillmentType = (docType: string) => {
    setRequirements((prev) =>
      prev.map((r) =>
        r.docType === docType
          ? { ...r, fulfillmentType: r.fulfillmentType === "generated_by_system" ? "employee_upload" : "generated_by_system" }
          : r
      )
    );
  };

  const removeRequirement = (docType: string) => {
    setRequirements((prev) => prev.filter((r) => r.docType !== docType));
  };

  const handleAddCustomType = async () => {
    const label = newTypeLabel.trim();
    if (!label) return;
    try {
      const created = await addCustomDocumentType(label);
      setRequirements((prev) => [...prev, { docType: created.value, label: created.label, appliesTo: "all" }]);
      setNewTypeLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มประเภทเอกสารไม่สำเร็จ");
    }
  };

  const startEditLabel = (docType: string, label: string) => {
    setError(null);
    setEditingValue(docType);
    setEditingLabel(label);
  };

  const cancelEditLabel = () => {
    setEditingValue(null);
    setEditingLabel("");
  };

  /**
   * แก้ชื่อที่แสดงของรายการนี้ "เฉพาะโครงการนี้" เท่านั้น (เช่น ใบปะหน้า/เอกสารขอทำบัตรรายคน
   * ที่แต่ละโครงการเรียกชื่อไม่เหมือนกัน) ไม่กระทบชื่อกลางใน catalog ที่โครงการอื่นใช้อยู่
   * บันทึกจริงตอนกด "บันทึก" ด้านล่าง (เหมือนการเปลี่ยนค่าอื่นๆ ในฟอร์มนี้)
   */
  const confirmEditProjectLabel = () => {
    const docType = editingValue;
    const label = editingLabel.trim();
    if (!docType || !label) return;
    setRequirements((prev) => prev.map((r) => (r.docType === docType ? { ...r, label } : r)));
    setEditingValue(null);
    setEditingLabel("");
  };

  /** แก้ไขชื่อกลางใน catalog (แก้คำผิดของชื่อตั้งต้น) มีผลกับทุกโครงการที่ยังไม่ได้ตั้งชื่อเฉพาะของตัวเอง */
  const confirmEditCatalogLabel = async () => {
    const docType = editingValue;
    const label = editingLabel.trim();
    if (!docType || !label) return;
    setBusyValue(docType);
    try {
      await renameDocumentType(docType, label);
      setEditingValue(null);
      setEditingLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "แก้ไขชื่อเอกสารไม่สำเร็จ");
    } finally {
      setBusyValue(null);
    }
  };

  const handleDeleteDocType = async (docType: string, label: string) => {
    if (!window.confirm(`ลบประเภทเอกสาร "${label}" ออกจากระบบ? การลบนี้จะมีผลกับทุกโครงการ`)) return;
    setBusyValue(docType);
    setError(null);
    try {
      await removeDocumentType(docType);
      setRequirements((prev) => prev.filter((r) => r.docType !== docType));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบประเภทเอกสารไม่สำเร็จ");
    } finally {
      setBusyValue(null);
    }
  };

  const handleUploadProjectTemplate = async (docType: string, file: File | null | undefined) => {
    if (!file) return;
    setTemplateBusyValue(docType);
    setError(null);
    try {
      const existing = requirements.find((r) => r.docType === docType);
      const uploaded = await uploadProjectDocumentTemplate(project.id, docType, file);
      setRequirements((prev) =>
        prev.map((r) =>
          r.docType === docType
            ? { ...r, templateUrl: uploaded.url, templateFileName: uploaded.fileName, templateUploadedAt: uploaded.uploadedAt }
            : r
        )
      );
      if (existing?.templateUrl) {
        removeProjectDocumentTemplate(existing.templateUrl).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดแบบฟอร์มไม่สำเร็จ");
    } finally {
      setTemplateBusyValue(null);
    }
  };

  const handleRemoveProjectTemplate = async (docType: string) => {
    const existing = requirements.find((r) => r.docType === docType);
    if (!existing?.templateUrl) return;
    setTemplateBusyValue(docType);
    setError(null);
    try {
      await removeProjectDocumentTemplate(existing.templateUrl);
      setRequirements((prev) =>
        prev.map((r) =>
          r.docType === docType
            ? { ...r, templateUrl: undefined, templateFileName: undefined, templateUploadedAt: undefined }
            : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบแบบฟอร์มไม่สำเร็จ");
    } finally {
      setTemplateBusyValue(null);
    }
  };

  const handleUploadDefaultTemplate = async (docType: string, label: string, file: File | null | undefined) => {
    if (!file) return;
    if (
      !window.confirm(
        `ตั้งเป็นแบบฟอร์มเริ่มต้นของบริษัทสำหรับ "${label}"?\nจะมีผลกับทุกโครงการที่ไม่ได้อัปโหลดแบบฟอร์มของตัวเองไว้`
      )
    )
      return;
    setTemplateBusyValue(docType);
    setError(null);
    try {
      await setDefaultDocumentTemplate(docType, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลด Default แบบฟอร์มไม่สำเร็จ");
    } finally {
      setTemplateBusyValue(null);
    }
  };

  const handleRemoveDefaultTemplate = async (docType: string) => {
    if (!window.confirm("ลบแบบฟอร์มเริ่มต้นของบริษัทสำหรับประเภทเอกสารนี้?")) return;
    setTemplateBusyValue(docType);
    setError(null);
    try {
      await removeDefaultDocumentTemplate(docType, defaultTemplates[docType]?.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Default แบบฟอร์มไม่สำเร็จ");
    } finally {
      setTemplateBusyValue(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const db = getFirestore();
      await updateDoc(doc(db, "CMG-HR-Database", "root", "projects", project.id), {
        [PROJECT_REQUIRED_DOCUMENTS_FIELD]: requirements,
        [PROJECT_ISSUES_OWN_ACCESS_BADGE_FIELD]: issuesOwnAccessBadge,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[95] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FileCheck2 className="text-blue-600" size={20} />
              เอกสารที่จำเป็นของโครงการ
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {project.project_no} {project.project_name ? `- ${project.project_name}` : ""}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ระบบจะใช้แจ้งเตือน (ไม่บล็อก) ตอนเลือกพนักงานเข้ารอบอบรม ว่าใครยังขาดเอกสารตามที่กำหนดไว้นี้
              แต่ละรายการสามารถแนบ "แบบฟอร์มเปล่า" ให้พนักงานดาวน์โหลดไปกรอกได้ ถ้าโครงการนี้ไม่มีแบบฟอร์มของตัวเอง
              ระบบจะใช้แบบฟอร์มเริ่มต้นของบริษัทแทนโดยอัตโนมัติ
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ชื่อรายการที่ติ๊กเลือกแล้วสามารถแก้ไขได้เฉพาะโครงการนี้ (กดไอคอนดินสอ) เช่น "ใบปะหน้า" หรือ
              "เอกสารขอทำบัตรรายคน" ที่แต่ละโครงการมักเรียกชื่อไม่เหมือนกัน โดยไม่กระทบชื่อกลางที่โครงการอื่นใช้อยู่
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-1">
          <label className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={issuesOwnAccessBadge}
              onChange={(e) => setIssuesOwnAccessBadge(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
            />
            <span className="text-xs text-gray-700">
              <span className="font-semibold text-gray-800">CMG เป็นคนออกบัตรผ่านเข้าโครงการนี้เอง</span> (ไม่ติ๊ก = โครงการ/
              ผู้ว่าจ้างเป็นคนทำบัตรให้ หลังอบรมผ่านแล้วรอรับบัตรจริงกลับมา ระบบจะให้ Safety/Admin แนบรูปบัตร
              หรือกรอกเลขบัตรที่ได้รับรายคน เพื่อปิดรอบอบรมของคนนั้น — ไม่เกี่ยวกับปุ่ม "ใบขอออกบัตร" ที่มีอยู่แล้ว
              ซึ่งเป็นแค่เอกสารขอ ใช้ได้ไม่ว่าใครเป็นคนออกบัตรจริง)
            </span>
          </label>
        </div>

        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-2">
          {catalog.map((opt) => {
            const checked = selectedDocTypes.has(opt.value);
            const current = requirements.find((r) => r.docType === opt.value);
            const isEditing = editingValue === opt.value;
            const isBusy = busyValue === opt.value;
            const isTemplateBusy = templateBusyValue === opt.value;
            const resolvedTemplate = current ? resolveDocumentTemplate(current, defaultTemplates) : null;
            return (
              <div
                key={opt.value}
                className={`border rounded-lg px-3 py-2 ${checked ? "border-blue-200 bg-blue-50/50" : "border-gray-200"}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(opt.value, opt.label)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (checked ? confirmEditProjectLabel() : confirmEditCatalogLabel());
                        if (e.key === "Escape") cancelEditLabel();
                      }}
                      className="flex-1 border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-800">
                    {checked ? current?.label || opt.label : opt.label}
                    {checked && current?.altGroupId && (
                      <span className="ml-1.5 text-[10px] font-normal text-indigo-600 align-middle">(กลุ่มทางเลือก)</span>
                    )}
                  </span>
                  )}
                  {checked && !isEditing && (
                    <select
                      value={current?.appliesTo || "all"}
                      onChange={(e) => updateAppliesTo(opt.value, e.target.value as ProjectDocumentAppliesTo)}
                      className="border rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      {PROJECT_DOCUMENT_APPLIES_TO_OPTIONS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  )}
                  {checked && !isEditing && (
                    <button
                      onClick={() => removeRequirement(opt.value)}
                      title="เอาออกจากรายการของโครงการนี้"
                      className="text-gray-300 hover:text-red-500 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {isEditing ? (
                    <>
                      <button
                        onClick={checked ? confirmEditProjectLabel : confirmEditCatalogLabel}
                        disabled={isBusy || !editingLabel.trim()}
                        title="บันทึกชื่อ"
                        className="text-green-600 hover:text-green-700 p-1 disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button onClick={cancelEditLabel} title="ยกเลิก" className="text-gray-400 hover:text-gray-600 p-1">
                        <X size={14} />
                      </button>
                    </>
                  ) : checked ? (
                    <button
                      onClick={() => startEditLabel(opt.value, current?.label || opt.label)}
                      title="แก้ไขชื่อเอกสารนี้ เฉพาะโครงการนี้ (ไม่กระทบชื่อกลาง เช่น ใบปะหน้า/เอกสารขอทำบัตรที่แต่ละโครงการเรียกไม่เหมือนกัน)"
                      className="text-gray-300 hover:text-blue-500 p-1"
                    >
                      <Pencil size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditLabel(opt.value, opt.label)}
                        title="แก้ไขชื่อกลางของประเภทเอกสารนี้ (มีผลทุกโครงการ)"
                        className="text-gray-300 hover:text-blue-500 p-1"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteDocType(opt.value, opt.label)}
                        disabled={isBusy}
                        title="ลบประเภทเอกสารนี้ออกจากระบบทั้งหมด"
                        className="text-gray-300 hover:text-red-600 p-1 disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </>
                  )}
                </div>

                {checked && (
                  <div className="ml-7 mt-1.5 flex items-center gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={current?.fulfillmentType === "generated_by_system"}
                        onChange={() => toggleFulfillmentType(opt.value)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      เป็นแบบฟอร์มที่ระบบ/HR สร้างให้เองตอนจบ (ไม่ต้องรอพนักงานอัปโหลด ไม่นับเป็นเอกสารขาด)
                    </label>
                  </div>
                )}

                {checked && (
                  <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <FileText size={12} className="text-gray-400 shrink-0" />
                    {isTemplateBusy && <Loader2 size={12} className="animate-spin text-gray-400" />}
                    {resolvedTemplate ? (
                      <>
                        <span className={resolvedTemplate.source === "project" ? "text-blue-700 font-medium" : "text-gray-500"}>
                          {resolvedTemplate.source === "project" ? "แบบฟอร์มของโครงการนี้:" : "ใช้ Default ของบริษัท:"}
                        </span>
                        <a
                          href={resolvedTemplate.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline truncate max-w-[220px]"
                        >
                          {resolvedTemplate.fileName}
                        </a>
                        {resolvedTemplate.source === "project" && (
                          <button
                            onClick={() => handleRemoveProjectTemplate(opt.value)}
                            disabled={isTemplateBusy}
                            title="ลบแบบฟอร์มของโครงการนี้ (กลับไปใช้ Default ของบริษัท)"
                            className="text-gray-300 hover:text-red-500 disabled:opacity-40"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-600">ยังไม่มีแบบฟอร์ม (ไม่มีของโครงการและไม่มี Default ของบริษัท)</span>
                    )}

                    <label className={`text-blue-600 hover:underline cursor-pointer ${isTemplateBusy ? "pointer-events-none opacity-40" : ""}`}>
                      {current?.templateUrl ? "แทนที่แบบฟอร์มของโครงการนี้" : "อัปโหลดแบบฟอร์มเฉพาะโครงการนี้"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={isTemplateBusy}
                        onChange={(e) => {
                          handleUploadProjectTemplate(opt.value, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <span className="text-gray-300">|</span>
                    <label className={`text-gray-500 hover:underline cursor-pointer ${isTemplateBusy ? "pointer-events-none opacity-40" : ""}`}>
                      ตั้งเป็น Default ของบริษัท
                      <input
                        type="file"
                        className="hidden"
                        disabled={isTemplateBusy}
                        onChange={(e) => {
                          handleUploadDefaultTemplate(opt.value, opt.label, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {defaultTemplates[opt.value] && (
                      <button
                        onClick={() => handleRemoveDefaultTemplate(opt.value)}
                        disabled={isTemplateBusy}
                        className="text-gray-400 hover:text-red-500 hover:underline disabled:opacity-40"
                      >
                        ลบ Default
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="border-t pt-3 mt-2">
            <p className="text-xs font-semibold text-gray-600 mb-1.5">
              กลุ่มเอกสารทางเลือก (เลือกอย่างใดอย่างหนึ่งก็พอ)
            </p>
            <p className="text-[11px] text-gray-400 mb-2">
              ใช้กรณีเอกสารหลายรายการใช้แทนกันได้ เช่น "ประกันสังคม ม.33/ม.40" หรือ "ประกันอุบัติเหตุ" หรือ
              "ประกันกลุ่ม" อย่างใดอย่างหนึ่งก็ถือว่าครบ — ไม่ต้องมีให้ครบทุกข้อ
            </p>
            {existingGroups.map(([groupId, items]) => (
              <div
                key={groupId}
                className="flex items-center gap-2 flex-wrap bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-2 text-xs"
              >
                <span className="text-indigo-700 font-medium whitespace-nowrap">เลือก 1 ใน:</span>
                {items.map((it) => (
                  <span key={it.docType} className="px-2 py-0.5 bg-white border border-indigo-200 rounded-full text-indigo-700">
                    {it.label}
                  </span>
                ))}
                <button
                  onClick={() => handleUngroup(groupId)}
                  title="ยกเลิกกลุ่มนี้ (กลับไปเป็นรายการเดี่ยว ๆ)"
                  className="ml-auto text-gray-400 hover:text-red-500 p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {!groupPanelOpen ? (
              <button
                onClick={() => setGroupPanelOpen(true)}
                disabled={requirements.filter((r) => !r.altGroupId).length < 2}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline"
              >
                <Plus size={12} /> สร้างกลุ่มทางเลือกใหม่
              </button>
            ) : (
              <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 flex flex-col gap-2">
                <p className="text-xs text-gray-600">
                  เลือกอย่างน้อย 2 รายการ (เฉพาะรายการที่ติ๊กไว้ด้านบนแล้ว และยังไม่อยู่ในกลุ่มอื่น) ที่ใช้แทนกันได้:
                </p>
                <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                  {requirements
                    .filter((r) => !r.altGroupId)
                    .map((r) => (
                      <label key={r.docType} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupSelection.has(r.docType)}
                          onChange={() => toggleGroupSelection(r.docType)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        {r.label}
                      </label>
                    ))}
                  {requirements.filter((r) => !r.altGroupId).length === 0 && (
                    <p className="text-[11px] text-gray-400">ไม่มีรายการที่ยังไม่ได้จัดกลุ่ม</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateGroup}
                    disabled={groupSelection.size < 2}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
                  >
                    สร้างกลุ่ม ({groupSelection.size})
                  </button>
                  <button
                    onClick={() => {
                      setGroupPanelOpen(false);
                      setGroupSelection(new Set());
                    }}
                    className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-100 rounded-lg"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-3 mt-2 flex items-center gap-2">
            <input
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              placeholder="เพิ่มประเภทเอกสารใหม่ (เช่น ใบขับขี่รถยก, ใบรับรองการฝึกอบรมเฉพาะทาง)"
              className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={handleAddCustomType}
              disabled={!newTypeLabel.trim()}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40"
            >
              <Plus size={14} /> เพิ่ม
            </button>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
};
