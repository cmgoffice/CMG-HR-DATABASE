"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";

/**
 * 🏛️ Header Template - Upper Dark Header & White Tab Bar
 * 
 * ดีไซน์ส่วนหัวแบบ 2 ชั้นระดับพรีเมียมที่พบในระบบของผู้บริหารระดับสูง:
 * - ชั้นบน (Upper Header): สีดำอมเขียวเข้ม แสดงรายละเอียดบริษัท สถานะ และวันที่แบบไทย
 * - ชั้นล่าง (White Sub-header Tabs): สีขาวมินิมอล แสดงแท็บเปลี่ยนสตรีมหน้าทำงานและการค้นหา
 */
export default function HeaderTemplate({ onMobileMenuClick }: { onMobileMenuClick?: () => void }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "ภาพรวมบริษัท" },
    { href: "/projects", label: "รายชื่อโครงการ" },
    { href: "/surveys", label: "รอบการประเมิน" },
    { href: "/actions", label: "รายการแก้ไข (CAR)" },
    { href: "/analytics", label: "วิเคราะห์ผลรวม" },
  ];

  return (
    <div className="w-full shrink-0 flex flex-col z-20">
      
      {/* 1. Upper Dark Header */}
      <header className="bg-[#082224] text-white py-3 px-5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <button 
              onClick={onMobileMenuClick} 
              className="md:hidden text-slate-300 hover:text-white p-1.5 transition-colors"
              aria-label="Toggle mobile menu"
            >
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-xs sm:text-sm font-semibold text-slate-400 tracking-wider uppercase leading-none mb-1">
                CMG Engineering & Construction
              </h1>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                CSAT System <span className="text-slate-500 font-normal">|</span> Executive Overview
              </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Active Status Badge */}
            <div className="flex items-center gap-1.5 bg-[#1E6B54]/15 text-[#1E6B54] border border-[#1E6B54]/30 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E6B54] animate-pulse"></span>
              ACTIVE
            </div>
            
            {/* Thai Calendar Date Match */}
            <div className="hidden sm:block text-slate-300 text-xs font-semibold bg-teal-950/40 px-3 py-1 rounded border border-teal-950/20">
              ณ วันที่ 27 ส.ค. 2569
            </div>
          </div>
        </div>
      </header>

      {/* 2. White Tab Sub-header Navigation */}
      <section className="bg-white border-b border-gray-200/80 px-5 flex items-center justify-between shadow-sm">
        <nav className="flex space-x-6 overflow-x-auto no-scrollbar pt-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link 
                key={tab.href}
                href={tab.href} 
                className={`border-b-2 py-3 text-xs tracking-wide transition-all ${
                  active 
                    ? "border-[#1E6B54] font-bold text-[#1E6B54]" 
                    : "border-transparent font-semibold text-gray-500 hover:text-[#0E5E56]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        
        {/* Search input inside tabs bar */}
        <div className="hidden lg:flex items-center gap-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
            <input 
              type="text" 
              placeholder="ค้นหาโครงการ..." 
              className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#0E5E56] focus:border-[#0E5E56] w-56 transition-all"
            />
          </div>
        </div>
      </section>

    </div>
  );
}
