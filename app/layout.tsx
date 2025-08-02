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
    "A fast, open-source voice assistant powered by Groq, ElevenLabs, Cartesia, and Vercel."
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
