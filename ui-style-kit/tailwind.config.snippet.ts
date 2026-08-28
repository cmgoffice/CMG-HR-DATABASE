import type { Config } from "tailwindcss";

/**
 * 🎨 Tailwind Configuration Snippet for Executive Slate-Teal Theme
 * 
 * คัดลอกการตั้งค่านี้ไปวางไว้ในไฟล์ tailwind.config.ts / tailwind.config.js ของคุณ
 * เพื่อเปิดใช้งานระบบสีและตัวอักษรระดับพรีเมียม
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
};

export default config;
