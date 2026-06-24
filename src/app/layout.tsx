import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from 'next/link';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reincodes",
  description: "Portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-[family-name:var(--font-geist-mono)]`}
      >
        <header className="sticky top-0 z-10 bg-black">
          <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-4 flex justify-between items-baseline">
            <Link
              className="block"
              href={"/"}
            >
              <h1 className="text-xl leading-none">
                Reincodes
              </h1>
            </Link>

            <nav className="flex gap-3.5 text-xs">
              <a href="https://github.com/rlynjb" target="_blank" rel="noopener noreferrer"
                 className="text-gray-400 hover:text-white">github</a>
              <a href="https://www.linkedin.com/in/rlynpro" target="_blank" rel="noopener noreferrer"
                 className="text-gray-400 hover:text-white">linkedin</a>
              <a href="mailto:rlynjb@gmail.com"
                 className="text-gray-400 hover:text-white">email</a>
              <a href="https://drive.google.com/file/d/1egeJunnCiQn9jGDP08KphynclI5cyBdb/view?usp=sharing"
                 target="_blank" rel="noopener noreferrer"
                 className="text-gray-400 hover:text-white">resume</a>
            </nav>
          </div>
        </header>

        <main className="mx-4 relative grid grid-cols-12"
          style={{ height: "85vh" }}
        >
          <div className="b-container col-span-12">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
