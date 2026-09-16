import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { VaultProvider } from "./VaultProvider";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "pgpkeygen",
  description: "PGP key management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <VaultProvider>{children}</VaultProvider>
      </body>
    </html>
  );
}
