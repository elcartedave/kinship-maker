import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, DM_Sans, Playfair_Display } from "next/font/google";

import { APP_DESCRIPTION, APP_NAME, PAPER_BACKGROUND } from "@/lib/kinship/constants";
import { AppShellProvider } from "@/components/providers/app-shell";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans", // This matches what we put in @theme!
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair", // This matches what we put in @theme!
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PAPER_BACKGROUND,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} min-h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShellProvider>
          <ServiceWorkerRegistration />
          {children}
        </AppShellProvider>
      </body>
    </html>
  );
}