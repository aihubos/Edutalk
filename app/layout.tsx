import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { AppProvider } from "@/lib/app-context";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { NetworkStatus } from "@/components/network-status";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
  title: { default: "EDU톡", template: "%s | EDU톡" },
  description: "동탄 교육기관과 튜터를 찾고 학생 성장을 관리하는 교육 플랫폼",
  applicationName: "EDU톡",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "EDU톡" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "EDU톡",
    title: "EDU톡",
    description: "동탄 교육기관과 튜터를 찾고 학생 성장을 관리하는 교육 플랫폼",
  },
  robots: process.env.NEXT_PUBLIC_DATA_MODE === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#3182F6",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AppProvider>
          <ServiceWorkerRegister />
          <NetworkStatus />
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
