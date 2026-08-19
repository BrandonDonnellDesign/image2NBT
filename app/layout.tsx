import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PixelForge — Image to Minecraft NBT",
  description: "Turn any image into a ready-to-build Minecraft NBT structure.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0d100e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
