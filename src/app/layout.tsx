import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { fontClassNamesFor, type Locale } from "@/lib/fonts";
import { SessionBoundary } from "@/components/shell/session-boundary";
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
  title: "oBizee Service ERP",
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
      // next-themes writes `class` and `style` on <html> from a blocking
      // inline script, before React hydrates. The server cannot know the
      // choice, so the mismatch is expected and is suppressed here — on this
      // element only, never on a subtree that renders real content.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/*
          Light is the default, not the system preference, and that is
          deliberate: the audience works a full day in a daylight office, and
          a coordinator whose laptop happens to be set to dark should not be
          handed the harder-to-read polarity for eight hours of data entry.
          `enableSystem` still honours an explicit OS preference; the top-bar
          toggle overrides both and persists.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <SessionBoundary>{children}</SessionBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
