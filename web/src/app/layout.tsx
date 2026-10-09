import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import AmbientMotion from "@/components/AmbientMotion";
import LiveRoomProvider from "@/components/LiveRoomProvider";
import MobileAccessGate from "@/components/MobileAccessGate";
import PushReconnect from "@/components/PushReconnect";
import PwaBridge from "@/components/PwaBridge";
import RoomEncryptionGate from "@/components/RoomEncryptionGate";
import RouteAnnouncer from "@/components/RouteAnnouncer";
import "./globals.css";
import "./polish-shared.css";
import "./pwa-access.css";
// The route error boundary's styles (tiny). Loaded here so the boundary's own
// chunk isn't preloaded-but-unused on every page.
import "./error.css";

// The brand webfonts are committed under ./fonts (latin subset, OFL licences
// alongside) and loaded with next/font/local, so neither the build nor the
// browser ever fetches from Google: the build works offline and no request
// leaks to a third party at runtime — important for this product.
//
// Cormorant and Geist are variable fonts, loaded as one variable face per
// style (the full weight range, no faux-bold for the odd 650). Cormorant keeps
// both styles: italic sets most display text, upright serif still sets the
// numeric titles. Mono only dresses small meta text, so it is not preloaded;
// it swaps in when it arrives.
const display = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-latin.woff2", weight: "300 700", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-italic.woff2", weight: "300 700", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

const sans = localFont({
  src: [{ path: "./fonts/geist-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

const mono = localFont({
  src: [{ path: "./fonts/jetbrains-mono-latin.woff2", weight: "400 500", style: "normal" }],
  variable: "--font-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "Menlo", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  // The brief calls out that even a share preview shouldn't out the product
  // category. Title, description, and the iOS home-screen icon label all
  // stay generic so anyone who glances at the user's phone or sees a share
  // preview doesn't learn what kind of app this is.
  title: "Private notes",
  description: "A private notebook for two.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/marks/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/marks/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/marks/app-icon-180.png", sizes: "180x180" }],
  },
  // Don't index, ever.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#170a10",
  // Dark only: renders <meta name="color-scheme" content="dark"> so native
  // form controls, scrollbars and autofill match the wine surfaces.
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Private" />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#app-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-skip-link focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:outline focus:outline-2 focus:outline-ink"
        >
          Skip to content
        </a>
        <RouteAnnouncer />
        <AmbientMotion />
        <MobileAccessGate>
          <PwaBridge />
          <PushReconnect />
          <LiveRoomProvider>
            <RoomEncryptionGate>{children}</RoomEncryptionGate>
          </LiveRoomProvider>
        </MobileAccessGate>
      </body>
    </html>
  );
}
