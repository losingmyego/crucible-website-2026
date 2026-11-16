import type { Metadata } from "next";
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
