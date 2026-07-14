import React, { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import { InfoTooltip } from "./InfoTooltip";
import {
  ShieldCheck,
  Save,
  RotateCcw,
  Loader2,
  Lock,
  Info,
  Check,
} from "lucide-react";
import {
  RolePermissionConfig,
  ROLE_PERMISSION_MODULES,
  ROLE_PERMISSION_ROLES,
  ROLE_PERMISSIONS_COLLECTION,
  ROLE_PERMISSIONS_DOC_ID,
  ROLE_PERMISSIONS_MODULE_KEY,
  ALWAYS_ALLOWED_FOR_SUPER_ADMIN,
  defaultVisibleForRole,
} from "../config/rolePermissions";

// Modules that are forced-on (and locked) for the MasterAdmin row so the
// super-admin can never lock itself out of this page or user management.
const LOCKED_FOR_MASTERADMIN = new Set(ALWAYS_ALLOWED_FOR_SUPER_ADMIN);

export const RolePermissionSettings = () => {
  const { hasRole } = useAuth();
  const db = getFirestore();

  const canEdit = hasRole(["MasterAdmin"]);

  const [config, setConfig] = useState<RolePermissionConfig>({});
  const [draft, setDraft] = useState<RolePermissionConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const ref = doc(
      db,
      "CMG-HR-Database",
      "root",
      ROLE_PERMISSIONS_COLLECTION,
      ROLE_PERMISSIONS_DOC_ID
    );
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as RolePermissionConfig) : {};
        setConfig(data || {});
        setDraft(data || {});
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [db]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config]
  );

  // Returns the effective checkbox state for a role/module in the current draft.
  // `undefined` means "no override" (falls back to default behavior).
  const getValue = (role: string, moduleKey: string): boolean | undefined => {
    const v = draft[role]?.[moduleKey];
    return typeof v === "boolean" ? v : undefined;
  };

  const isLocked = (role: string, moduleKey: string): boolean => {
    // The settings page column is MasterAdmin-only and cannot be granted to
    // anyone else, so lock every cell in that column.
    if (moduleKey === ROLE_PERMISSIONS_MODULE_KEY) return true;
    // Guard against MasterAdmin self-lockout for critical modules.
    if (role === "MasterAdmin" && LOCKED_FOR_MASTERADMIN.has(moduleKey)) return true;
    return false;
  };

  const lockedValue = (role: string, moduleKey: string): boolean => {
    if (moduleKey === ROLE_PERMISSIONS_MODULE_KEY) return role === "MasterAdmin";
    if (role === "MasterAdmin" && LOCKED_FOR_MASTERADMIN.has(moduleKey)) return true;
    return true;
  };

  const toggle = (role: string, moduleKey: string) => {
    if (!canEdit || isLocked(role, moduleKey)) return;
    setDraft((prev) => {
      const current = prev[role]?.[moduleKey];
      // Cycle: undefined (default) -> true -> false -> undefined
      let next: boolean | undefined;
      if (current === undefined) next = true;
      else if (current === true) next = false;
      else next = undefined;

      const roleMap = { ...(prev[role] || {}) };
      if (next === undefined) {
        delete roleMap[moduleKey];
      } else {
        roleMap[moduleKey] = next;
      }
      const nextConfig: RolePermissionConfig = { ...prev, [role]: roleMap };
      if (Object.keys(roleMap).length === 0) {
        delete nextConfig[role];
      }
      return nextConfig;
    });
  };

  const handleSave = async () => {
    if (!canEdit || !dirty) return;
    setSaving(true);
    try {
      const ref = doc(
        db,
        "CMG-HR-Database",
        "root",
        ROLE_PERMISSIONS_COLLECTION,
        ROLE_PERMISSIONS_DOC_ID
      );
      // Overwrite (not merge) so that cleared overrides are actually removed.
      await setDoc(ref, draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      console.error("Failed to save role permissions", e);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDraft = () => {
    if (!canEdit) return;
    setDraft(config);
  };

  const handleResetAllToDefault = () => {
    if (!canEdit) return;
    // Clearing all overrides -> everything falls back to default behavior.
    setDraft({});
  };

  if (!canEdit) {
    return (
      <div className="max-w-xl mx-auto mt-10 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <Lock className="mx-auto mb-4 text-amber-500" size={48} />
        <h2 className="text-lg font-bold text-amber-800 mb-2">
          ไม่มีสิทธิ์เข้าถึง
        </h2>
        <p className="text-sm text-amber-700">
          หน้าจัดการสิทธิ์การเข้าถึงตาม Role สงวนไว้สำหรับผู้ดูแลระบบสูงสุด
          (MasterAdmin) เท่านั้น
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <ShieldCheck className="text-blue-600" />
          จัดการสิทธิ์การเข้าถึงตาม Role
          <InfoTooltip content="กำหนดว่า Role ใดสามารถเห็นเมนู/โมดูลใดในแถบด้านซ้าย การตั้งค่านี้เป็นการ override การกำหนดสิทธิ์เดิม" />
        </h1>
      </header>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info size={18} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            ทุกช่องจะแสดง<b>ค่าที่มีผลจริง</b>เสมอ: ไอคอน<b>สีจาง</b> = ค่าเริ่มต้นตามระบบ
            (ยังไม่ override), ไอคอน<b>สีเข้ม</b> = ค่าที่กำหนดเอง (override).
            คลิกที่ช่องเพื่อสลับสถานะ: ค่าเริ่มต้น → อนุญาต → ไม่อนุญาต → ค่าเริ่มต้น
          </p>
          <p>
            ช่องที่ <b>ไม่ได้ตั้งค่า</b> จะใช้พฤติกรรมเดิมของระบบโดยอัตโนมัติ
            เพื่อไม่ให้กระทบผู้ใช้เดิม และ MasterAdmin
            จะเข้าถึงหน้านี้และหน้าจัดการผู้ใช้ได้เสมอ
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
            dirty && !saving
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          บันทึกการตั้งค่า
        </button>
        <button
          onClick={handleResetDraft}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw size={16} />
          ยกเลิกการแก้ไข
        </button>
        <button
          onClick={handleResetAllToDefault}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw size={16} />
          รีเซ็ตทั้งหมดเป็นค่าเริ่มต้น
        </button>
        {savedFlash && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
            <Check size={16} /> บันทึกแล้ว
          </span>
        )}
        {dirty && !savedFlash && (
          <span className="text-sm font-medium text-amber-600">
            มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-semibold text-gray-600 border-b border-gray-200 min-w-[220px]">
                  โมดูล / เมนู
                </th>
                {ROLE_PERMISSION_ROLES.map((role) => (
                  <th
                    key={role}
                    className="px-3 py-3 text-center font-semibold text-gray-600 border-b border-l border-gray-200 whitespace-nowrap"
                  >
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_PERMISSION_MODULES.map((mod) => (
                <tr key={mod.key} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-gray-700 border-b border-gray-100 whitespace-nowrap">
                    {mod.label}
                  </td>
                  {ROLE_PERMISSION_ROLES.map((role) => {
                    const locked = isLocked(role, mod.key);
                    // Explicit override for non-locked cells (undefined = inherit default).
                    const explicit = locked ? undefined : getValue(role, mod.key);
                    const isExplicit = explicit !== undefined;
                    // The computed hard-coded default for this single role.
                    const defaultVal = defaultVisibleForRole(mod.key, role);
                    // The effective value shown in the cell.
                    const shown = locked
                      ? lockedValue(role, mod.key)
                      : isExplicit
                      ? (explicit as boolean)
                      : defaultVal;
                    // A muted style means "inherited default, not an explicit override".
                    const muted = !locked && !isExplicit;

                    let cellClass: string;
                    if (locked) {
                      cellClass = "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
                    } else if (isExplicit) {
                      cellClass = shown
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-red-400 bg-red-400 text-white";
                    } else {
                      // Inherited default -> muted / light styling.
                      cellClass = shown
                        ? "border-green-300 bg-green-50 text-green-500 hover:border-green-400"
                        : "border-red-200 bg-red-50 text-red-300 hover:border-red-300";
                    }

                    return (
                      <td
                        key={role}
                        className="px-3 py-2.5 text-center border-b border-l border-gray-100"
                      >
                        <button
                          type="button"
                          onClick={() => toggle(role, mod.key)}
                          disabled={locked}
                          title={
                            locked
                              ? "ล็อกไว้เพื่อความปลอดภัย (แก้ไขไม่ได้)"
                              : muted
                              ? `ค่าเริ่มต้นตามระบบ: ${shown ? "เห็น" : "ไม่เห็น"} (ยังไม่ override) — คลิกเพื่อกำหนดเอง`
                              : shown
                              ? "อนุญาต (กำหนดเอง) — คลิกเพื่อเปลี่ยน"
                              : "ไม่อนุญาต (กำหนดเอง) — คลิกเพื่อเปลี่ยน"
                          }
                          className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold transition-colors ${cellClass}`}
                        >
                          {shown ? <Check size={16} /> : "\u2715"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-green-500 bg-green-500 text-white">
            <Check size={12} />
          </span>
          อนุญาต (กำหนดเอง)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-red-400 bg-red-400 text-white">
            {"\u2715"}
          </span>
          ไม่อนุญาต (กำหนดเอง)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-green-300 bg-green-50 text-green-500">
            <Check size={12} />
          </span>
          ค่าเริ่มต้นตามระบบ: เห็น (ยังไม่ override)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-red-200 bg-red-50 text-red-300">
            {"\u2715"}
          </span>
          ค่าเริ่มต้นตามระบบ: ไม่เห็น (ยังไม่ override)
        </span>
        <span className="inline-flex items-center gap-1">
          <Lock size={12} /> ล็อกเพื่อป้องกันการล็อกตัวเอง (MasterAdmin)
        </span>
      </div>
    </div>
  );
};
