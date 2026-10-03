import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource-variable/jetbrains-mono";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: "Keystar", template: "%s · Keystar" },
    description: t.common.appTagline,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale } = await getI18n();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full text-ink">
        <div className="space-backdrop" aria-hidden />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
