import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Objednávky chleba',
  description: 'Systém pro objednávky pečiva',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>
        {children}
      </body>
    </html>
  );
}
