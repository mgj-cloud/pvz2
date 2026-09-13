import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "毁蛇阵时序实验室",
  description: "PVZ2 中国版无尽竞速毁蛇阵的毫秒级事件模拟工具。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
