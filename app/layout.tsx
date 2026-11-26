import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Memory Lane",
  description: "Turn trip photos into an interactive scrapbook map.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf6ee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="paper-grain min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
