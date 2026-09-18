import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant-garamond",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  style: ["normal"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const title =
  "Re-Embroidered Conversations — One-to-One Listening with Shahd Karaeen";
const description =
  "Private one-to-one listening conversations with Palestinian writer and author Shahd Karaeen, exploring survival, memory, and healing.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${cormorantGaramond.variable} ${plusJakartaSans.variable} bg-[#FAF8F5] text-[#282524] antialiased selection:bg-[#E8DCCF] selection:text-[#282524]`}
      >
        {children}
      </body>
    </html>
  );
}
