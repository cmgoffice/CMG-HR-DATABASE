import React, { useMemo } from "react";
import {
  THAI_PROVINCES,
  getDistrictsByProvince,
  getSubDistrictsByDistrict,
} from "../data/thailandAddress";

/**
 * Dropdown ที่อยู่แบบลำดับขั้น: ประเทศ > จังหวัด > อำเภอ > ตำบล > รหัสไปรษณีย์
 *
 * - ถ้า "ประเทศ" เป็น "ไทย" (หรือยังไม่ได้เลือก/ว่าง) จะแสดง dropdown จังหวัด/อำเภอ/ตำบล
 *   โดยดึงข้อมูลจริงจาก src/data/thailandAddress.ts (77 จังหวัดทั่วประเทศ)
 *   เลือกตำบลแล้วจะเติมรหัสไปรษณีย์ให้อัตโนมัติ (แก้ไขเองได้ในกรณีตำบลมีหลายรหัส)
 * - ถ้า "ประเทศ" เป็นอย่างอื่น (เช่น เมียนมา, กัมพูชา) จะแสดงช่องกรอกข้อความอิสระแทน
 *   เพราะระบบเขตการปกครองของประเทศอื่นไม่เหมือนไทย
 *
 * ค่าที่บันทึกยังคงเป็น field เดิม (ประเทศ, จังหวัด, เขตอำเภอ, แขวงตำบล, ไปรษณีย์)
 * เพื่อไม่ให้กระทบส่วนอื่นของระบบที่อ่านฟิลด์เหล่านี้อยู่
 */

export const THAI_ADDRESS_FIELD_IDS = [
  "ประเทศ",
  "จังหวัด",
  "เขตอำเภอ",
  "แขวงตำบล",
  "ไปรษณีย์",
] as const;

export const COUNTRY_OPTIONS = ["ไทย", "เมียนมา", "กัมพูชา", "ลาว", "เวียดนาม", "อื่นๆ"];

// ตัดคำนำหน้า (จ./อ./ต./เขต/แขวง/ตำบล/อำเภอ/จังหวัด) ออกเพื่อให้จับคู่กับข้อมูลเก่าที่เคยกรอกเป็น free text ได้
const stripPrefix = (raw: string): string =>
  String(raw || "")
    .trim()
    .replace(/^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)\s*/i, "")
    .trim();

const findProvince = (storedName: string) => {
  if (!storedName) return undefined;
  const core = stripPrefix(storedName);
  return THAI_PROVINCES.find((p) => p.name === storedName || stripPrefix(p.name) === core);
};

const findDistrict = (storedName: string, provinceId?: number) => {
  if (!storedName) return undefined;
  const core = stripPrefix(storedName);
  const pool = provinceId ? getDistrictsByProvince(provinceId) : [];
  return pool.find((d) => d.name === storedName || stripPrefix(d.name) === core);
};

const findSubDistrict = (storedName: string, districtId?: number) => {
  if (!storedName) return undefined;
  const core = stripPrefix(storedName);
  const pool = districtId ? getSubDistrictsByDistrict(districtId) : [];
  return pool.find((s) => s.name === storedName || stripPrefix(s.name) === core);
};

const selectClass =
  "w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white";
const textClass = selectClass;

export function ThaiAddressGroupFields({
  labels,
  formData,
  onChangeFields,
}: {
  labels: Partial<Record<(typeof THAI_ADDRESS_FIELD_IDS)[number], string>>;
  formData: Record<string, unknown>;
  onChangeFields: (changes: Record<string, string>) => void;
}) {
  const country = String(formData["ประเทศ"] ?? "");
  const provinceName = String(formData["จังหวัด"] ?? "");
  const districtName = String(formData["เขตอำเภอ"] ?? "");
  const subDistrictName = String(formData["แขวงตำบล"] ?? "");
  const zip = String(formData["ไปรษณีย์"] ?? "");

  const isThailand = country === "" || country === "ไทย";

  const selectedProvince = useMemo(() => findProvince(provinceName), [provinceName]);
  const districtOptions = useMemo(
    () => (selectedProvince ? getDistrictsByProvince(selectedProvince.id) : []),
    [selectedProvince]
  );
  const selectedDistrict = useMemo(
    () => findDistrict(districtName, selectedProvince?.id),
    [districtName, selectedProvince]
  );
  const subDistrictOptions = useMemo(
    () => (selectedDistrict ? getSubDistrictsByDistrict(selectedDistrict.id) : []),
    [selectedDistrict]
  );
  const selectedSubDistrict = useMemo(
    () => findSubDistrict(subDistrictName, selectedDistrict?.id),
    [subDistrictName, selectedDistrict]
  );

  const handleCountryChange = (value: string) => {
    if (value === "ไทย") {
      onChangeFields({ ประเทศ: value });
    } else {
      // เปลี่ยนไปประเทศอื่น -> เคลียร์ข้อมูลจังหวัด/อำเภอ/ตำบล/ไปรษณีย์แบบไทย เพื่อไม่ให้ค้างข้อมูลผิดระบบ
      onChangeFields({ ประเทศ: value, จังหวัด: "", เขตอำเภอ: "", แขวงตำบล: "", ไปรษณีย์: "" });
    }
  };

  const handleProvinceChange = (name: string) => {
    onChangeFields({ จังหวัด: name, เขตอำเภอ: "", แขวงตำบล: "", ไปรษณีย์: "" });
  };

  const handleDistrictChange = (name: string) => {
    onChangeFields({ เขตอำเภอ: name, แขวงตำบล: "", ไปรษณีย์: "" });
  };

  const handleSubDistrictChange = (name: string) => {
    const found = subDistrictOptions.find((s) => s.name === name);
    onChangeFields({
      แขวงตำบล: name,
      ไปรษณีย์: found ? String(found.zip).padStart(5, "0") : "",
    });
  };

  return (
    <>
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">{labels["ประเทศ"] || "ประเทศ"}</label>
        <select
          className={selectClass}
          value={isThailand ? "ไทย" : country}
          onChange={(e) => handleCountryChange(e.target.value)}
        >
          {COUNTRY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {isThailand ? (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["จังหวัด"] || "จังหวัด"}</label>
            <select
              className={selectClass}
              value={selectedProvince?.name ?? ""}
              onChange={(e) => handleProvinceChange(e.target.value)}
            >
              <option value="">-- กรุณาเลือก --</option>
              {THAI_PROVINCES.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["เขตอำเภอ"] || "เขต/อำเภอ"}</label>
            <select
              className={selectClass}
              value={selectedDistrict?.name ?? ""}
              onChange={(e) => handleDistrictChange(e.target.value)}
              disabled={!selectedProvince}
            >
              <option value="">{selectedProvince ? "-- กรุณาเลือก --" : "-- เลือกจังหวัดก่อน --"}</option>
              {districtOptions.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["แขวงตำบล"] || "แขวง/ตำบล"}</label>
            <select
              className={selectClass}
              value={selectedSubDistrict?.name ?? ""}
              onChange={(e) => handleSubDistrictChange(e.target.value)}
              disabled={!selectedDistrict}
            >
              <option value="">{selectedDistrict ? "-- กรุณาเลือก --" : "-- เลือกอำเภอก่อน --"}</option>
              {subDistrictOptions.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["ไปรษณีย์"] || "รหัสไปรษณีย์"}</label>
            <input
              type="text"
              className={textClass}
              value={zip}
              onChange={(e) => onChangeFields({ ไปรษณีย์: e.target.value })}
              placeholder="เลือกตำบลเพื่อเติมอัตโนมัติ"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["จังหวัด"] || "จังหวัด/รัฐ"}</label>
            <input
              type="text"
              className={textClass}
              value={provinceName}
              onChange={(e) => onChangeFields({ จังหวัด: e.target.value })}
              placeholder={`ระบุ ${labels["จังหวัด"] || "จังหวัด/รัฐ"}`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["เขตอำเภอ"] || "เขต/อำเภอ"}</label>
            <input
              type="text"
              className={textClass}
              value={districtName}
              onChange={(e) => onChangeFields({ เขตอำเภอ: e.target.value })}
              placeholder={`ระบุ ${labels["เขตอำเภอ"] || "เขต/อำเภอ"}`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["แขวงตำบล"] || "แขวง/ตำบล"}</label>
            <input
              type="text"
              className={textClass}
              value={subDistrictName}
              onChange={(e) => onChangeFields({ แขวงตำบล: e.target.value })}
              placeholder={`ระบุ ${labels["แขวงตำบล"] || "แขวง/ตำบล"}`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{labels["ไปรษณีย์"] || "รหัสไปรษณีย์"}</label>
            <input
              type="text"
              className={textClass}
              value={zip}
              onChange={(e) => onChangeFields({ ไปรษณีย์: e.target.value })}
              placeholder={`ระบุ ${labels["ไปรษณีย์"] || "รหัสไปรษณีย์"}`}
            />
          </div>
        </>
      )}
    </>
  );
}
