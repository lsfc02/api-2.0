import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API ATLAS - Backend Service',
  description: 'Sistema de roteirização inteligente por clusters geográficos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="font-mono">{children}</body>
    </html>
  );
}