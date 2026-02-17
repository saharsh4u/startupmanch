import type { Metadata } from "next";
import { Inconsolata } from "next/font/google";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
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
  title: "StartupManch \u2013 India\u2019s Startup Marketplace for Founders & Investors",
  description:
    "India-first startup marketplace for founders and investors."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const themeBootstrapScript = `
    (function () {
      try {
        var key = ${JSON.stringify(THEME_STORAGE_KEY)};
        var fallback = ${JSON.stringify(DEFAULT_THEME)};
        var stored = localStorage.getItem(key);
        var theme = stored === "light" || stored === "dark" ? stored : fallback;
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      } catch (error) {
        document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
        document.documentElement.style.colorScheme = ${JSON.stringify(DEFAULT_THEME)};
      }
    })();
  `;

  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${inconsolataDisplay.variable} ${inconsolataBody.variable}`}>
        {children}
      </body>
    </html>
  );
}
