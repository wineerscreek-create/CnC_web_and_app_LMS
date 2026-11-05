import type { Config } from 'tailwindcss';

/**
 * CNC (Campus to Corporate) Centralized Design System
 * Ivory / Sage / Gold Theme Palette
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: {
          DEFAULT: 'hsl(var(--input))',
          border: 'hsl(var(--border))',
          focus: 'hsl(var(--ring))',
        },
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        heading: 'hsl(var(--heading))',
        'gold-text': 'hsl(var(--gold-text))',

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary) / 0.9)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          hover: 'hsl(var(--accent) / 0.9)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          border: 'hsl(var(--border))',
        },

        'chart-1': 'hsl(var(--chart-1))',
        'chart-2': 'hsl(var(--chart-2))',
        'chart-3': 'hsl(var(--chart-3))',
        'chart-4': 'hsl(var(--chart-4))',
        'chart-5': 'hsl(var(--chart-5))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },

        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--primary-foreground))',
          bg: 'hsl(var(--success) / 0.1)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--accent-foreground))',
          bg: 'hsl(var(--warning) / 0.15)',
        },
        danger: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          bg: 'hsl(var(--destructive) / 0.1)',
        },
        info: {
          DEFAULT: 'hsl(var(--primary))',
          bg: 'hsl(var(--primary) / 0.1)',
        },

        // Legacy compatibility mappings
        mustard: {
          DEFAULT: 'hsl(var(--accent))',
          light: 'hsl(var(--secondary))',
          dark: 'hsl(var(--gold-text))',
          50: 'hsl(var(--accent) / 0.08)',
          100: 'hsl(var(--accent) / 0.15)',
          200: 'hsl(var(--accent) / 0.25)',
        },
        ivory: {
          DEFAULT: 'hsl(var(--background))',
          canvas: 'hsl(var(--background))',
          muted: 'hsl(var(--muted))',
          dark: 'hsl(var(--border))',
        },
        charcoal: {
          DEFAULT: 'hsl(var(--foreground))',
          950: 'hsl(var(--heading))',
          900: 'hsl(var(--heading))',
          800: 'hsl(var(--heading))',
          700: 'hsl(var(--muted-foreground))',
          600: 'hsl(var(--muted-foreground))',
          500: 'hsl(var(--muted-foreground))',
          400: 'hsl(var(--muted-foreground))',
          300: 'hsl(var(--border))',
          200: 'hsl(var(--muted))',
          100: 'hsl(var(--card))',
          50: 'hsl(var(--background))',
        },
        surface: {
          DEFAULT: 'hsl(var(--card))',
          elevated: 'hsl(var(--card))',
          muted: 'hsl(var(--muted))',
          glass: 'hsl(var(--card) / 0.95)',
          hover: 'hsl(var(--muted))',
        },
        sidebar: 'hsl(var(--card))',
        header: 'hsl(var(--background) / 0.94)',
        line: {
          DEFAULT: 'hsl(var(--border))',
          soft: 'hsl(var(--border) / 0.6)',
          subtle: 'hsl(var(--border) / 0.3)',
        },
        ink: {
          1: 'hsl(var(--foreground))',
          2: 'hsl(var(--muted-foreground))',
          3: 'hsl(var(--muted-foreground))',
        },
        app: 'hsl(var(--background))',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        sm: 'var(--radius-sm)',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        pop: 'var(--shadow-pop)',
        '3d-card': 'var(--shadow-3d-card)',
        '3d-hover': 'var(--shadow-3d-hover)',
        '3d-pop': 'var(--shadow-3d-pop)',
        bento: '0 1px 2px rgba(26, 26, 26, 0.06), 0 4px 16px rgba(26, 26, 26, 0.05)',
        'bento-hover': '0 4px 12px rgba(26, 26, 26, 0.08), 0 12px 28px rgba(26, 26, 26, 0.08)',
        neutral: '0 1px 2px rgba(26, 26, 26, 0.06), 0 4px 16px rgba(26, 26, 26, 0.05)',
      },
      fontFamily: {
        heading: ['var(--font-manrope)', 'Manrope', 'Inter', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-manrope)', 'Manrope', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', '15px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '21px'],
        md: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '38px'],
        '4xl': ['36px', '44px'],
        '5xl': ['48px', '56px'],
        hero: ['clamp(2.4rem, 4.8vw, 4.25rem)', '1.12'],
        display: ['clamp(1.85rem, 3.5vw, 2.75rem)', '1.2'],
      },
      keyframes: {
        fade: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        fadeInUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.98)' }, to: { opacity: '1', transform: 'scale(1)' } },
        pulseSlow: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        fade: 'fade .2s ease-out',
        'fade-in-up': 'fadeInUp .3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn .2s ease-out',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        'accordion-down': 'accordion-down .2s ease-out',
        'accordion-up': 'accordion-up .2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
