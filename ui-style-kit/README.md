# 🏛️ CMG Executive Premium UI Style Kit
ชุดคู่มือและไฟล์เทมเพลตสำหรับการนำดีไซน์ระบบ CSAT (ธีม **Executive Slate-Teal** และฟอนต์ **IBM Plex Sans Thai**) ไปใช้งานกับเว็บไซต์อื่นๆ เพื่อให้หน้าตาและประสบการณ์การใช้งานเป็นมาตรฐานเดียวกันในระดับพรีเมียม

ชุดไฟล์นี้ออกแบบขึ้นมาสำหรับนักพัฒนา (ระดับสูง) เพื่อให้สามารถคัดลอกส่วนประกอบหลัก ไม่ว่าจะเป็นโทนสี, ฟอนต์, แถบเมนูด้านข้าง, ส่วนหัวของหน้าเว็บ (Header), และการจัดวางกลุ่มการ์ดข้อมูล (KPI Cards) ไปใช้ในโปรเจกต์ Next.js + Tailwind CSS อื่นๆ ได้ทันที!

---

## 📂 โครงสร้างชุดไฟล์ (Style Kit Folder Structure)
ในโฟลเดอร์นี้คุณจะพบไฟล์ที่สำคัญดังนี้:
1. **`tailwind.config.snippet.ts`** - การกำหนดค่าสีและการตั้งค่าฟอนต์สำหรับ Tailwind CSS
2. **`global.css`** - การตั้งค่าฟอนต์และสไตล์พื้นฐานของหน้าเว็บ
3. **`components/SidebarTemplate.tsx`** - เมนูด้านข้างสีเข้ม (Dark-Navy Sidebar) แบบหดขยายได้
4. **`components/HeaderTemplate.tsx`** - ส่วนหัวสองชั้นระดับพรีเมียม (Dark Upper Header & White Sub-header Tab Navigation)
5. **`components/KPICardsTemplate.tsx`** - การ์ดตัวชี้วัด (KPI Cards) แบบมีขอบเน้นสีและแถบความคืบหน้า (Progress Bar)

---

## 🚀 ขั้นตอนการติดตั้งและนำไปใช้งาน (Integration Guide)

### ขั้นตอนที่ 1: ติดตั้งฟอนต์ IBM Plex Sans Thai และ Inter
ในโปรเจกต์ Next.js ของคุณ ให้เปิดไฟล์ `layout.tsx` (หรือ Root Layout) และทำการนำเข้าและติดตั้งฟอนต์ตามตัวอย่างนี้:

```tsx
import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

// กำหนดค่าฟอนต์ภาษาไทยและอังกฤษแบบพรีเมียม
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Your System Title",
  description: "Your system description",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={ibmPlexSansThai.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
```

---

### ขั้นตอนที่ 2: อัปเดต Tailwind Config
ให้เปิดไฟล์ `tailwind.config.ts` หรือ `tailwind.config.js` ในโปรเจกต์ของคุณ แล้วเพิ่มรหัสสีของชุดธีม **Executive Slate-Teal** เข้าไปในส่วน `theme.extend.colors` ดังนี้ (สามารถคัดลอกจากไฟล์ `tailwind.config.snippet.ts` ได้):

```typescript
colors: {
  cmg: {
    red: '#DC2626',       // แดงเข้มหรูหรา (Elegant Crimson Red)
    blue: '#0E5E56',      // เขียวหัวเป็ด/น้ำเงินอมเขียวเข้ม (Elegant Deep Slate Green/Teal)
    darkBlue: '#082224',  // สีดำอมเขียวเข้มสไตล์ผู้บริหาร (Deep Teal Black)
    lightBlue: '#EAF5F2', // สีพื้นหลังไฮไลท์โทนเขียวสว่าง (Soft Light Teal Background Highlight)
    gray: '#F4F6F6',      // สีเทาสว่างระดับพรีเมียม (Beautiful Light Executive Gray)
    darkGray: '#3A3F42',  // สีเทาชาร์โคลสำหรับตัวอักษรให้อ่านง่าย (Charcoal Gray)
    green: '#1E6B54',     // สีเขียวมรกตสำหรับแท็บใช้งานหรือตัวชี้วัดเชิงบวก (Positive Emerald)
    orange: '#EA580C',    // สีส้มอมแดงสำหรับแจ้งเตือน งานรอแก้ไข หรือ CAR (Alert Orange)
  }
}
```

---

### ขั้นตอนที่ 3: ปรับแต่ง Global CSS
นำโค้ดในไฟล์ `global.css` ของเราไปปรับใช้กับโปรเจกต์ของคุณ เพื่อให้สีพื้นหลังของระบบทั้งหมดเน้นสีเทาพรีเมียมอบอุ่น:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 58, 63, 66; /* สีเทาชาร์โคล cmg-darkGray */
  --background-start-rgb: 244, 246, 246; /* สีเทาสว่าง cmg-gray */
  --background-end-rgb: 255, 255, 255;
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
  min-height: 100vh;
}
```

---

### ขั้นตอนที่ 4: คัดลอกส่วนประกอบพรีเมียม (Components Collection)
คุณสามารถนำไฟล์ React Components ต่างๆ ในโฟลเดอร์นี้ไปปรับเข้ากับโครงสร้างของระบบของคุณ:
* **แถบข้างหดขยายได้:** ใช้ `components/SidebarTemplate.tsx` เพื่อให้ระบบมี Sidebar สีเข้มที่มีปุ่มย่อ/ขยายอย่างลื่นไหล
* **ส่วนหัวสองชั้นสไตล์ผู้บริหาร:** ใช้ `components/HeaderTemplate.tsx` เพื่อแบ่งเลย์เอาต์ออกเป็นสองชั้น ชั้นบนเป็นแถบสีเข้มสุดหรู (Upper Dark Header) ชั้นล่างเป็นแถบแสดงแท็บทำงานสีขาวมินิมอล (White Sub-header Tabs)
* **การ์ดตัวชี้วัด:** ใช้ `components/KPICardsTemplate.tsx` ในส่วนภาพรวมข้อมูล เพื่อจัดกลุ่มตัวเลขให้อ่านง่าย มีมิติ และมีขอบเน้นสีและแถบความคืบหน้า (Progress Bar) ที่สอดคล้องกับตัวชี้วัด

---

## 🎨 หลักการดีไซน์ของธีมนี้ (Design Principles)
1. **Contrast & Authority (ความน่าเชื่อถือและความคมชัด):** การใช้สีเข้ม `#082224` ที่ขอบบนและแถบด้านข้าง ทำให้ระบบดูมีโครงสร้างมั่นคง มีความน่าเชื่อถือ เหมาะสำหรับระบบจัดการธุรกิจวิศวกรรมและการก่อสร้าง
2. **Readability (ความง่ายในการอ่านภาษาไทย):** ฟอนต์ `IBM Plex Sans Thai` ถูกออกแบบมาให้มีหัวและระยะห่างระหว่างตัวอักษรที่ดีที่สุดสำหรับการอ่านบนหน้าจอในระบบข้อมูลเชิงลึก
3. **Modern Micro-indicators (ตัวบ่งชี้ขนาดเล็ก):** การ์ด KPI แต่ละใบไม่ได้มีแค่ตัวเลข แต่มีแถบความคืบหน้าขนาดจิ๋ว (Thin Progress Bar) และขอบเน้นสีแนวตั้งทางซ้าย (Left Border Accent) เพื่อช่วยให้ผู้ใช้รับรู้ถึง "สถานะ" ของการ์ดใบนั้นได้ทันทีโดยไม่ต้องอ่านข้อความทั้งหมด
