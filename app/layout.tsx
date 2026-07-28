import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Manrope, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// next/font でビルド時に自己ホスト化（CDN不要・オフライン静的配布でも崩れない）。
// Manrope = 欧文/数字、Noto Sans JP = 和文本文、Bebas Neue = 大型数字・英字スロット専用。
const manrope = Manrope({
  subsets: ["latin"],
  // 本体CSSは 500/800 も使用（見出し・スタッツ数値）。欠くと合成太字に劣化する
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});
const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
  display: "swap",
});
const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ALFA FOOTBALL — 戦術ボード / チーム運営",
  description:
    "少年・学校サッカー向け。スタメン作成・戦術アニメーション・出欠/連絡・試合記録をスマホで。ホワイトボードの指示が、消えずに全員へ届く。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#15803d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${manrope.variable} ${notoSansJp.variable} ${bebas.variable}`}>
      <body>{children}</body>
    </html>
  );
}
