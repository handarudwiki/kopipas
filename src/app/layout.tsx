import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "KopiPass", template: "%s · KopiPass" },
  description: "Paket bukti EUDR dan validasi dokumen ekspor kopi",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0e8f7e" };

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('kp-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.dataset.theme='dark'}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
