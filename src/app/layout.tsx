import type { Metadata } from "next";
import { Inconsolata } from "next/font/google";
import "./globals.css";

const inconsolataDisplay = Inconsolata({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"]
});

const inconsolataBody = Inconsolata({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "StartupManch | Startup Marketplace",
  description:
    "India-first startup marketplace for founders and investors."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inconsolataDisplay.variable} ${inconsolataBody.variable}`}>
        {children}
      </body>
    </html>
  );
}
