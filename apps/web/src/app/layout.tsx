import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

import { GlobalBackgroundProvider } from '@/components/ui/GlobalBackgroundLayer';
import { StoreProvider } from '@/store/provider';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SkillSharp — Campus to Corporate',
    template: '%s · SkillSharp',
  },
  description:
    'SkillSharp — An elite career-readiness and soft-skills platform empowering students to learn, practise, and build essential skills for professional career success.',
  robots: { index: true, follow: true },
  applicationName: 'SkillSharp — Campus to Corporate',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4A5D4E',
};

const themeAntiFlashScript = `
(function() {
  try {
    var stored = localStorage.getItem('skillsharp_theme') || localStorage.getItem('cnc_theme') || localStorage.getItem('wc_theme');
    var isDark = stored === 'dark';
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeAntiFlashScript }} />
      </head>
      <body className="relative min-h-screen antialiased selection:bg-accent/40 selection:text-foreground bg-background text-foreground">
        <StoreProvider>
          <ThemeProvider>
            <GlobalBackgroundProvider>
              <div className="relative z-10 flex min-h-screen flex-col">
                {children}
              </div>
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    fontSize: '13px',
                    borderRadius: '12px',
                    border: '1px solid rgba(23, 23, 23, 0.08)',
                    boxShadow: '0 8px 24px -4px rgba(23, 23, 23, 0.08)',
                  },
                }}
              />
            </GlobalBackgroundProvider>
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
