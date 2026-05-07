import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Thief — Party Game',
  description: 'A fun party game of deception and deduction',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <main className="max-w-md mx-auto px-4 py-8 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
