import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Nunito, Quicksand, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const quicksand = Quicksand({ variable: "--font-quicksand", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dream Sounds — Baby Sleep Sounds",
  description:
    "Soothing, generated sounds and white noise to help babies and children fall asleep. Works fully offline and keeps playing in the background.",
  applicationName: "Dream Sounds",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dream Sounds",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", type: "image/png" }],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${quicksand.variable} ${geistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        <PwaRegister />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
