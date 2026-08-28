"use client";

import React from "react";
import { TrendingUp, Users, AlertTriangle, CheckCircle2, Info } from "lucide-react";

/**
 * 🏛️ KPI Cards Template - Premium Left-Border Accent Cards
 * 
 * ชุดการ์ดสรุปสถิติมิติต่างๆ ในรูปแบบพรีเมียม:
 * - Left Border Accent: แถบสีหนา 4px ทางด้านซ้ายเพื่อแยกประเภทข้อมูล (เขียว, เขียวเข้ม, แดง, ส้ม)
 * - Thin Progress Bar: แถบความคืบหน้าเรียบหรูขนาด 4px ด้านล่างแสดงร้อยละความสำเร็จ
 * - Info Hover Tooltip: ไอคอนกล่องแนะนำข้อมูลเพื่อช่วยผู้ใช้งานเข้าใจที่มาของตัวเลข
 */
export default function KPICardsTemplate() {
  const cardsData = [
    {
      title: "AVERAGE CSAT",
      thaiTitle: "คะแนนเฉลี่ยความพึงพอใจ",
      value: "86.4%",
      subText: "เป้าหมาย >85%",
      badge: "48 responses",
      badgeColor: "bg-[#EAF5F2] text-[#1E6B54]",
      progress: 86.4,
      borderColor: "border-l-[#1E6B54]",
      progressBarColor: "bg-[#1E6B54]",
      icon: <TrendingUp className="text-[#1E6B54]" size={14} />,
      tooltip: "คะแนนความพึงพอใจเฉลี่ยของบริษัทในรอบประเมินนี้",
    },
    {
      title: "RESPONSE RATE",
      thaiTitle: "อัตราการตอบแบบประเมิน",
      value: "91.2%",
      subText: "เป้าหมาย 100%",
      badge: "26/28 โครงการ",
      badgeColor: "bg-[#EAF5F2] text-[#0E5E56]",
      progress: 91.2,
      borderColor: "border-l-[#0E5E56]",
      progressBarColor: "bg-[#0E5E56]",
      icon: <Users className="text-[#0E5E56]" size={14} />,
      tooltip: "ร้อยละของผู้ประเมินที่ส่งข้อมูลตอบกลับเทียบกับทั้งหมด",
    },
    {
      title: "CRITICAL ALERTS",
      thaiTitle: "เรื่องแจ้งเตือนเร่งด่วน",
      value: "3 รายการ",
      subText: "ต้องแก้ไขทันที",
      badge: "ต้องแก้ไขด่วน",
      badgeColor: "bg-red-50 text-[#DC2626]",
      progress: 100,
      borderColor: "border-l-[#DC2626]",
      progressBarColor: "bg-[#DC2626]",
      icon: <AlertTriangle className="text-[#DC2626]" size={14} />,
      tooltip: "พบแบบประเมินที่มีคะแนนต่ำกว่าเกณฑ์ (คะแนน 1 หรือ 2)",
    },
    {
      title: "OPEN CAR ACTIONS",
      thaiTitle: "งานค้างดำเนินการ CAR",
      value: "8 แผนงาน",
      subText: "ค้างดำเนินการ",
      badge: "2 เกินกำหนด",
      badgeColor: "bg-orange-50 text-[#EA580C]",
      progress: 45,
      borderColor: "border-l-[#EA580C]",
      progressBarColor: "bg-[#EA580C]",
      icon: <CheckCircle2 className="text-[#EA580C]" size={14} />,
      tooltip: "แผนดำเนินการแก้ไขและป้องกัน (Corrective Action Request)",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      {cardsData.map((card, idx) => (
        <div 
          key={idx}
          className={`bg-white p-3.5 rounded border border-gray-200/80 border-l-[4px] ${card.borderColor} shadow-sm flex flex-col justify-between hover:shadow-md transition-all group cursor-pointer`}
        >
          {/* Card Header & Tooltip */}
          <div>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1 group/tooltip relative">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">
                  {card.title}
                </h3>
                <Info size={11} className="text-gray-400 cursor-help" />
                <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/tooltip:block w-48 p-2 bg-gray-800 text-white text-[10px] rounded shadow-lg z-50">
                  {card.tooltip}
                  <div className="absolute top-full left-3 -mt-1 border-4 border-transparent border-t-gray-800"></div>
                </div>
              </div>
              {card.icon}
            </div>
            
            {/* Card Value */}
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900 leading-none">
                {card.value}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {card.subText}
              </span>
            </div>
          </div>

          {/* Thin Progress Bar & Subtitle */}
          <div className="mt-3.5">
            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${card.progressBarColor}`} style={{ width: `${card.progress}%` }}></div>
            </div>
            <div className="mt-2 flex justify-between items-center">
              <p className="text-[9px] text-slate-400 font-medium">{card.thaiTitle}</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${card.badgeColor}`}>
                {card.badge}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
