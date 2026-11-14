import type { Metadata } from 'next';
import { Inter, Lalezar, Noto_Naskh_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { Footer } from '@/shared/components/layout/Footer';
import { Header } from '@/shared/components/layout/Header';
import { Providers } from '@/shared/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Signboard lettering for the Urdu name and headings. Naskh only downloads if a letter is missing
// from Lalezar, so it is not preloaded.
const lalezar = Lalezar({
  weight: '400',
  subsets: ['arabic', 'latin'],
  variable: '--font-lalezar',
  display: 'swap',
});
const naskh = Noto_Naskh_Arabic({
  weight: '700',
  subsets: ['arabic'],
  variable: '--font-naskh',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Chaman Tikka Shop', template: '%s | Chaman Tikka Shop' },
  description: "Lahore's finest BBQ. Order delivery, pickup or dine-in. Open 6 PM to 2 AM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lalezar.variable} ${naskh.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          <Providers>
            <Header />
            {children}
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
