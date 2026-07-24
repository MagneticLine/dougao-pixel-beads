import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "豆稿 · 像素图转拼豆图纸",
  description: "在浏览器本地把模糊、压缩的像素图还原成清晰的拼豆图纸。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
