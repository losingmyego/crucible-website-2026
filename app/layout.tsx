import type { Metadata } from "next";
// Cantarell, from Google Fonts (SIL Open Font Licence), served with the site.
import "@fontsource/cantarell/400.css";
import "@fontsource/cantarell/400-italic.css";
import "@fontsource/cantarell/700.css";
import "./globals.css";
import { PanelToggle } from "./lab";

export const metadata: Metadata = {
  title: "Crucible",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PanelToggle />
      </body>
    </html>
  );
}
