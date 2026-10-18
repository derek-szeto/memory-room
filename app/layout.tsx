import type { Metadata } from 'next';
import './globals.css';
import './sections.css';
export const metadata: Metadata = {title: 'Memory Room — Your shared workspace', description: 'A shared document for notes, lists, and everything you keep together.', icons: {icon: 'data:,'}};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
