import React, { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { PageGuideContent } from "../config/pageGuides";

export const PageGuideButton = ({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 ${className}`.trim()}
  >
    <BookOpen size={14} />
    วิธีอ่านหน้านี้
  </button>
);

export const PageGuideModal = ({
  open,
  guide,
  onClose,
}: {
  open: boolean;
  guide: PageGuideContent;
  onClose: () => void;
}) => {
  const [selectedScreenshot, setSelectedScreenshot] = useState<
    PageGuideContent["screenshots"][number] | null
  >(null);
  const [missingImages, setMissingImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      setSelectedScreenshot(null);
      setMissingImages({});
    }
  }, [open]);

  const markImageMissing = (src: string) => {
    setMissingImages((current) =>
      current[src] ? current : { ...current, [src]: true }
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-700">
              <BookOpen size={14} />
              วิธีอ่านหน้านี้
            </div>
            <h3 className="mt-1 text-base font-black text-slate-900 sm:text-lg">
              {guide.title}
            </h3>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              {guide.purpose}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ปิด
          </button>
        </div>

        <div className="max-h-[80vh] space-y-5 overflow-y-auto px-4 py-4 text-sm text-slate-700 sm:px-5 sm:py-5">
          <section className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              ใครควรใช้
            </div>
            <div className="mt-1 font-medium text-sky-900">{guide.audience}</div>
          </section>

          <section>
            <h4 className="text-sm font-black text-slate-900">วิธีอ่านข้อมูลแบบ 1-2-3</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {guide.readOrder.map((step, index) => (
                <div
                  key={`${guide.id}-step-${index + 1}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="text-xs font-semibold text-slate-500">
                    ขั้นตอน {index + 1}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-black text-slate-900">Section สำคัญ</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {guide.sections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="font-semibold text-slate-900">{section.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {section.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {guide.tabs && guide.tabs.length > 0 && (
            <section>
              <h4 className="text-sm font-black text-slate-900">แท็บหรือหน้าหลักที่ควรรู้</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {guide.tabs.map((tab) => (
                  <div
                    key={tab.title}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="font-semibold text-slate-900">{tab.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {tab.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {guide.workflow && guide.workflow.length > 0 && (
            <section>
              <h4 className="text-sm font-black text-slate-900">Flow การทำงาน</h4>
              <div className="mt-3 space-y-3">
                {guide.workflow.map((step) => (
                  <div
                    key={step.title}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="font-semibold text-slate-900">{step.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="text-sm font-black text-slate-900">
              จุดที่ควร callout บนภาพ
            </h4>
            <div className="mt-3 space-y-3">
              {guide.screenshots.map((screenshot) => (
                (() => {
                  const imageMissing = !!missingImages[screenshot.imageSrc];

                  return (
                    <div
                      key={screenshot.label}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
                        <button
                          type="button"
                          onClick={() => setSelectedScreenshot(screenshot)}
                          disabled={imageMissing}
                          className={`group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition ${
                            imageMissing
                              ? "cursor-not-allowed"
                              : "hover:border-sky-300 hover:shadow-md"
                          }`}
                        >
                          {imageMissing ? (
                            <div className="flex h-40 items-center justify-center bg-slate-100 px-4 text-center text-xs text-slate-500">
                              ยังไม่พบไฟล์ภาพในแอป
                            </div>
                          ) : (
                            <img
                              src={screenshot.imageSrc}
                              alt={screenshot.imageAlt}
                              className="h-40 w-full object-cover object-top"
                              onError={() => markImageMissing(screenshot.imageSrc)}
                            />
                          )}
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
                            <div>
                              <div className="text-xs font-semibold text-slate-900">
                                {screenshot.label}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {imageMissing ? "รอไฟล์ภาพตาม path ที่กำหนด" : "คลิกเพื่อดูภาพใหญ่"}
                              </div>
                            </div>
                            <div
                              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                                imageMissing
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
                              }`}
                            >
                              {imageMissing ? "รอไฟล์ภาพ" : "ดูภาพใหญ่"}
                            </div>
                          </div>
                        </button>

                        <div>
                          <div className="font-semibold text-slate-900">
                            {screenshot.label}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {screenshot.summary}
                          </p>
                          {imageMissing && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              วางไฟล์ภาพที่ <code>{screenshot.imageSrc}</code>
                            </div>
                          )}
                          <div className="mt-3 space-y-2">
                            {screenshot.callouts.map((callout, index) => (
                              <div
                                key={`${screenshot.label}-${callout.area}`}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                              >
                                <div className="text-xs font-semibold text-slate-500">
                                  จุด {index + 1}: {callout.area}
                                </div>
                                <div className="mt-1 text-sm text-slate-800">
                                  {callout.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            <X size={16} />
            เข้าใจแล้ว
          </button>
        </div>
      </div>

      {selectedScreenshot && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div
            className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-sky-700">
                  {guide.title}
                </div>
                <div className="mt-1 text-base font-black text-slate-900">
                  {selectedScreenshot.label}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedScreenshot.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScreenshot(null)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ปิดภาพ
              </button>
            </div>

            <div className="bg-slate-100 p-3 sm:p-5">
              <img
                src={selectedScreenshot.imageSrc}
                alt={selectedScreenshot.imageAlt}
                className="max-h-[78vh] w-full rounded-xl border border-slate-200 bg-white object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
