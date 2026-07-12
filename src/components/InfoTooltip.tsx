import React, { useState } from "react";
import { HelpCircle } from "lucide-react";

export const InfoTooltip = ({
  content,
  className = "",
  iconSize = 15,
}: {
  content: React.ReactNode;
  className?: string;
  iconSize?: number;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center justify-center rounded-full text-slate-400 hover:text-sky-600 focus:outline-none"
        aria-label="ข้อมูลเพิ่มเติม"
      >
        <HelpCircle size={iconSize} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-600 shadow-xl">
          {content}
        </div>
      )}
    </span>
  );
};
