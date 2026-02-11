import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ember — AI Memory Platform",
  description:
    "Capture conversations, extract memories, and give any AI platform persistent context about you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#f59e0b",
          colorBackground: "#18181b",
          colorInputBackground: "#1f1f23",
          colorInputText: "#fafafa",
        },
      }}
    >
      <html lang="en" className="dark">
        <head>
          <link
            href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Source+Sans+3:ital,wght@0,200..900;1,200..900&family=JetBrains+Mono:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="min-h-screen bg-ember-bg text-ember-text antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
