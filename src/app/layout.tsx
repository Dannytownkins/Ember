import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ember — AI Memory Platform",
  description:
    "Stop re-introducing yourself to AI. Ember captures your conversations — facts and feelings — so any AI picks up where you left off. Works with ChatGPT, Claude, Gemini, and more.",
  manifest: "/manifest.json",
  themeColor: "#f59e0b",
  openGraph: {
    title: "Ember — Your AI Should Remember You",
    description:
      "Stop re-introducing yourself to AI. Carry your Embers everywhere.",
    siteName: "Ember",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ember — Your AI Should Remember You",
    description:
      "Stop re-introducing yourself to AI. Carry your Embers everywhere.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ember",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Source+Sans+3:ital,wght@0,200..900;1,200..900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen bg-ember-bg text-ember-text antialiased">
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
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
