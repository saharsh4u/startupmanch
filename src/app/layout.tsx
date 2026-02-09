import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const spaceGroteskDisplay = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"]
});

const spaceGroteskBody = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-home",
  weight: ["400", "700"]
});

export const metadata: Metadata = {
  title: "StartupManch | Startup Marketplace",
  description:
    "India-first startup marketplace for founders and investors."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${spaceGroteskDisplay.variable} ${spaceGroteskBody.variable} ${spaceMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
