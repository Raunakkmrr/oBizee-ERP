import type { Metadata } from "next";
import { fontClassNamesFor, type Locale } from "@/lib/fonts";
import "./globals.css";

/**
 * Until the i18n layer lands (FR-1304: language is a per-role default with a
 * per-user override), every request renders in English — which is the default
 * for the Owner, Coordinator and Accountant roles anyway. The Technician role's
 * regional default is a tenant setting and is resolved server-side once
 * sessions exist.
 */
const locale: Locale = "en";

export const metadata: Metadata = {
  title: "Obez Service ERP",
  description:
    "Lead to job to sign-off to GST invoice to payment, for Indian service businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `data-scroll-behavior="smooth"`. Next 16 stopped overriding
    // scroll-behaviour during navigation, and §6.13.8 wants navigation to feel
    // instant rather than animated — so the new default is what we want.
    <html
      lang={locale}
      className={`${fontClassNamesFor(locale)} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
