import './globals.css';

export const metadata = {
  title: 'ViralClipper — AI-Powered YouTube Clip Extractor',
  description:
    'Paste any YouTube URL and our AI finds the most viral-worthy moments using the 5-Step Illusion of Novelty framework. Auto-trim, subtitle overlay, and export in 9:16 for TikTok, Reels & Shorts.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
