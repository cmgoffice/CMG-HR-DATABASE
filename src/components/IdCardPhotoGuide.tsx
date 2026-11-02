// ---------------------------------------------------------------------------
// ตัวอย่าง/มาตรฐานการถ่ายรูปสำเนาบัตรประชาชน (ไทย-อังกฤษ)
//
// ปัญหาที่เจอบ่อย: พนักงาน/ผู้รับเหมาถ่ายรูปบัตรด้วยมือถือเอง พื้นหลังหลากหลาย
// (โต๊ะไม้ กระเบื้อง ผ้า) เอียง แสงสะท้อน อ่านไม่ออก — คอมโพเนนต์นี้แสดงตัวอย่าง
// ถูก/ผิดแบบภาพ (วาดด้วย CSS จำลอง ไม่ใช้รูปบัตรจริง เพื่อความปลอดภัยของข้อมูล)
// ให้ผู้ใช้เห็นตอนเลือกอัปโหลด "สำเนาบัตรประชาชน" เพื่อลดอัตราเอกสารตีกลับ
//
// ไฟล์ PDF ฉบับเต็ม (พิมพ์แจกได้): public/templates/id-card-guide/id-card-photo-standard.th-en.pdf
// ---------------------------------------------------------------------------
import React, { useState } from "react";
import { Camera, CheckCircle2, Download, Info, Smartphone, X, XCircle } from "lucide-react";

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;
const GUIDE_PDF_URL = asset("/templates/id-card-guide/id-card-photo-standard.th-en.pdf");
const SCAN_APP_GUIDE_PDF_URL = asset("/templates/id-card-guide/how-to-scan-id-card.th-en.pdf");

/** ประเภทเอกสารที่ถือเป็น "สำเนาบัตรประชาชน" — ใช้ตัดสินใจว่าจะโชว์ปุ่ม/คำเตือนนี้หรือไม่ */
export const isIdCardDocType = (docType: string): boolean =>
  docType === "id_card" || docType === "id_card_certified";

const MockIdCard = ({ tilted }: { tilted?: boolean }) => (
  <div
    className="w-[72px] h-[46px] bg-white rounded-[4px] shadow-md flex gap-1.5 p-1.5"
    style={tilted ? { transform: "rotate(14deg)" } : undefined}
  >
    <div className="w-[15px] h-[18px] bg-slate-300 rounded-[2px] mt-0.5 shrink-0" />
    <div className="flex-1 flex flex-col gap-[3px] mt-0.5">
      <span className="block h-[2.5px] rounded-full bg-sky-400 w-[70%]" />
      <span className="block h-[2.5px] rounded-full bg-slate-400 w-full" />
      <span className="block h-[2.5px] rounded-full bg-slate-300 w-[55%]" />
      <span className="block h-[2.5px] rounded-full bg-slate-400 w-[80%]" />
    </div>
  </div>
);

const ExampleTile = ({
  ok,
  frameClassName,
  frameStyle,
  titleTh,
  titleEn,
  tilted,
}: {
  ok: boolean;
  frameClassName: string;
  frameStyle?: React.CSSProperties;
  titleTh: string;
  titleEn: string;
  tilted?: boolean;
}) => (
  <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
    <div className={`relative h-[90px] flex items-center justify-center ${frameClassName}`} style={frameStyle}>
      <span
        className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${
          ok ? "bg-emerald-600" : "bg-red-600"
        }`}
      >
        {ok ? "ถูกต้อง / OK" : "ผิด / NG"}
      </span>
      <MockIdCard tilted={tilted} />
    </div>
    <div className="px-2 py-1.5 text-center">
      <div className="text-[11px] font-semibold text-gray-700 leading-tight">{titleTh}</div>
      <div className="text-[9.5px] text-gray-400 leading-tight">{titleEn}</div>
    </div>
  </div>
);

/** เนื้อหาตัวอย่าง (ใช้ซ้ำได้ทั้งแบบ modal และแบบฝังในหน้า) */
export const IdCardPhotoGuideContent = () => (
  <div className="flex flex-col gap-4">
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mb-1.5">
          <CheckCircle2 size={14} /> ต้องทำ
        </h4>
        <ul className="text-[11.5px] text-gray-700 leading-relaxed list-disc list-inside space-y-0.5">
          <li>วางบัตรบนกระดาษ A4 สีขาวล้วน</li>
          <li>ถ่ายตรง ไม่เอียง เห็นขอบครบ 4 ด้าน</li>
          <li>แสงพอดี ไม่มีเงา/แสงสะท้อน</li>
          <li>ตัวอักษร/ตัวเลขคมชัด อ่านออก</li>
        </ul>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <h4 className="text-xs font-bold text-red-700 flex items-center gap-1.5 mb-1.5">
          <XCircle size={14} /> ห้ามทำ
        </h4>
        <ul className="text-[11.5px] text-gray-700 leading-relaxed list-disc list-inside space-y-0.5">
          <li>พื้นหลังมีสี/ลวดลาย เช่น โต๊ะ กระเบื้อง ผ้า</li>
          <li>ถ่ายเอียง มุมบิด หรือบัตรไม่เต็มเฟรม</li>
          <li>แฟลช/แสงสะท้อนจนอ่านไม่ออก ภาพเบลอ</li>
          <li>ตัดต่อ/แก้ไขพื้นหลังด้วยโปรแกรมใดๆ</li>
        </ul>
      </div>
    </div>

    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">ตัวอย่างภาพ · Visual examples</p>
      <div className="grid grid-cols-4 gap-2">
        <ExampleTile ok frameClassName="bg-gray-100" titleTh="พื้นขาว ถ่ายตรง" titleEn="White bg, straight" />
        <ExampleTile
          ok={false}
          frameClassName=""
          frameStyle={{ background: "linear-gradient(135deg,#8a5a2b,#5c3a18)" }}
          titleTh="พื้นหลังโต๊ะไม้ + เอียง"
          titleEn="Wood bg + tilted"
          tilted
        />
        <ExampleTile
          ok={false}
          frameClassName=""
          frameStyle={{
            background:
              "repeating-linear-gradient(45deg,#fca5a5 0 10px,#fcd34d 10px 20px,#86efac 20px 30px,#93c5fd 30px 40px)",
          }}
          titleTh="พื้นหลังลาย/หลากสี"
          titleEn="Busy / colorful bg"
        />
        <ExampleTile
          ok={false}
          frameClassName=""
          frameStyle={{ background: "linear-gradient(135deg,#1e293b,#334155)" }}
          titleTh="มืด + แสงสะท้อน/เบลอ"
          titleEn="Dark + glare / blurry"
        />
      </div>
    </div>

    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
      <h4 className="text-xs font-bold text-sky-800 flex items-center gap-1.5 mb-1.5">
        <Smartphone size={14} /> แนะนำ: ใช้แอปสแกนเอกสารในมือถือ (มีกรอบนำถ่าย + ปรับพื้นขาวให้อัตโนมัติ)
      </h4>
      <ul className="text-[11px] text-sky-800 leading-relaxed list-disc list-inside space-y-0.5">
        <li>
          <b>ไม่ต้องโหลดเพิ่ม:</b> Android ใช้ Google Drive (แตะ + &rarr; สแกน) &middot; iPhone ใช้ Notes (แตะไอคอนกล้อง &rarr;
          สแกนเอกสาร)
        </li>
        <li>
          <b>โหลดฟรีเพิ่มเติม (ถ้าต้องการ):</b> Adobe Scan หรือ Microsoft Lens — ใช้ได้ทั้ง Android/iOS
        </li>
      </ul>
      <p className="text-[10px] text-sky-600 mt-1">
        Tip: use a mobile scanning app — Google Drive / Notes are already on your phone; Adobe Scan or Microsoft Lens
        are free alternatives.
      </p>
      <a
        href={SCAN_APP_GUIDE_PDF_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline mt-2"
      >
        <Download size={13} /> ดูขั้นตอนทีละแอปแบบละเอียด (PDF) / Step-by-step guide per app
      </a>
    </div>

    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 leading-relaxed">
      <b>หมายเหตุ:</b> ห้ามแก้ไข/ตัดต่อ/เปลี่ยนพื้นหลังสำเนาบัตรด้วยโปรแกรมตัดต่อภาพใดๆ เนื่องจากเป็นเอกสารยืนยันตัวตน
      หากพื้นหลังไม่ได้มาตรฐาน กรุณาถ่ายใหม่ตามตัวอย่างด้านบน
      <br />
      <span className="text-amber-700">
        Note: do not edit or digitally alter the ID copy background — it is an identity document. Please retake the
        photo if it does not meet this standard.
      </span>
    </div>

    <a
      href={GUIDE_PDF_URL}
      target="_blank"
      rel="noreferrer"
      className="self-start flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
    >
      <Download size={13} /> ดาวน์โหลดเอกสารมาตรฐานฉบับเต็ม (PDF) / Download full guide
    </a>
  </div>
);

/** ปุ่มเล็กๆ แทรกข้าง select ประเภทเอกสาร — กดแล้วเปิด modal ตัวอย่างการถ่ายรูปบัตร */
export const IdCardPhotoGuideButton = ({ highlight }: { highlight?: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
          highlight
            ? "bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
        title="ดูตัวอย่างการถ่ายรูปบัตรประชาชนที่ถูกต้อง"
      >
        {highlight ? <Camera size={13} /> : <Info size={13} />}
        ดูตัวอย่างถ่ายรูปบัตร
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-start justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <Camera className="text-sky-600" size={18} />
                  มาตรฐานการถ่าย/สำเนาบัตรประชาชน
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">ID Card Copy – Photo Standard</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <IdCardPhotoGuideContent />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
