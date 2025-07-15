import type { Metadata } from "next";
import clsx from "clsx";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "Swift",
  description:
    "A fast, open-source voice assistant powered by Groq, Cartesia, and Vercel."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={clsx(
          "py-8 px-6 lg:p-10 dark:text-white bg-white dark:bg-black min-h-dvh flex flex-col justify-between antialiased font-sans select-none"
        )}
      >
        <main className="flex flex-col items-center justify-center grow">
          {children}
        </main>

        <Toaster richColors theme="system" />
        <Analytics />
      </body>
    </html>
  );
}
