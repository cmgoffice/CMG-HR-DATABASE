"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Users, CheckCircle2, AlertTriangle, Settings, LogOut, ShieldAlert } from "lucide-react";

/**
 * 🏛️ Sidebar Template - Executive Slate-Teal Collapsible Menu
 * 
 * เมนูด้านข้างแบบยืดหดได้ที่ใช้โทนสีดำอมเขียวเข้ม (Deep Teal Black)
 * และมีการใช้ Transition อนิเมชั่นที่เรียบหรูและตอบสนองได้รวดเร็ว
 */
export default function SidebarTemplate() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/projects", label: "Projects", icon: Users },
    { href: "/surveys", label: "Survey Cycles", icon: CheckCircle2 },
    { href: "/actions", label: "Corrective Actions", icon: AlertTriangle },
  ];

  const expanded = hovered;

  const handleMouseEnter = () => {
    window.clearTimeout(leaveTimer.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    leaveTimer.current = window.setTimeout(() => setHovered(false), 180);
  };

  return (
    <aside
      className={`fixed z-30 h-full flex flex-col border-r border-teal-950/20 bg-[#082224] transition-all duration-300 ease-in-out md:relative
        ${expanded ? "md:w-56" : "md:w-16"} hidden md:flex`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Brand / Logo */}
      <div className="flex h-14 shrink-0 items-center overflow-hidden border-b border-teal-950/40 px-4">
        <Link href="/" className="flex min-w-[200px] items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#DC2626] shadow-sm">
            <span className="text-xs font-bold text-white">CMG</span>
          </div>
          <span className={`text-sm font-bold tracking-wide text-white transition-opacity duration-300 ${expanded ? "opacity-100" : "opacity-0"}`}>
            CSAT System
          </span>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="no-scrollbar flex-1 overflow-y-auto overflow-x-hidden py-3">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                    active ? "bg-[#0E5E56] text-white shadow-sm" : "text-slate-300 hover:bg-teal-950/40 hover:text-white"
                  }`}
                >
                  <Icon size={18} className={`shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                  <span className={`whitespace-nowrap transition-opacity duration-300 ${expanded ? "opacity-100" : "opacity-0"}`}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer Settings & Logout */}
      <div className="shrink-0 border-t border-teal-950/40 p-2">
        <ul className="space-y-1">
          <li>
            <Link
              href="/settings"
              className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                pathname === "/settings" ? "bg-[#0E5E56] text-white" : "text-slate-300 hover:bg-teal-950/40 hover:text-white"
              }`}
            >
              <Settings size={18} className={`shrink-0 ${pathname === "/settings" ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
              <span className={`whitespace-nowrap transition-opacity duration-300 ${expanded ? "opacity-100" : "opacity-0"}`}>Settings</span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-red-950/30 hover:text-red-400 transition-colors"
            >
              <LogOut size={18} className="shrink-0 text-slate-400 group-hover:text-red-400" />
              <span className={`whitespace-nowrap transition-opacity duration-300 ${expanded ? "opacity-100" : "opacity-0"}`}>Logout</span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
