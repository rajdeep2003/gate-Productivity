import './globals.css';

export const metadata = {
  title: 'GATE/27 Study Ledger',
  description: 'A focused study timer, session journal, and progress dashboard for GATE 2027 preparation.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
