import type { Metadata } from 'next';
import './globals.css';
import SessionWrapper from './components/SessionWrapper';

export const metadata: Metadata = {
  title: 'Streaming Rainbow',
  description: 'Session scheduling for Zoboomafoo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <SessionWrapper>{children}</SessionWrapper>
      </body>
    </html>
  );
}
