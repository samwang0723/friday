import { Analytics } from "@vercel/analytics/react";
import clsx from "clsx";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { NotificationProvider } from "./lib/hooks/useNotifications";
import { getLocale } from "./lib/i18n";

export const metadata: Metadata = {
  title: "Friday",
  description:
    "A fast, open-source voice assistant powered by Groq, Cartesia, and Vercel."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  // Load messages for the current locale
  const messages = (await import(`./messages/${locale}.json`)).default;

  return (
    <html lang={locale}>
      <head>
        <link
          rel="apple-touch-icon"
          sizes="60x60"
          href="/apple-icon-60x60.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="72x72"
          href="/apple-icon-72x72.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="/apple-icon-76x76.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="114x114"
          href="/apple-icon-114x114.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/apple-icon-120x120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="144x144"
          href="/apple-icon-144x144.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/apple-icon-152x152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-icon-180x180.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/android-icon-192x192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="96x96"
          href="/favicon-96x96.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/ms-icon-144x144.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={clsx(
          "py-8 px-6 lg:p-10 dark:text-white min-h-dvh flex flex-col justify-between antialiased font-sans select-none"
        )}
        style={{
          backgroundColor: "#09051a",
          overscrollBehaviorX: "auto"
        }}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NotificationProvider>
            <main className="flex flex-col items-center justify-center grow">
              {children}
            </main>

            <Toaster richColors theme="system" position="bottom-left" />
            <Analytics />
          </NotificationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
