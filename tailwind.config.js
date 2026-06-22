/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FBF6EA',
          100: '#F5EBD0',
          200: '#E8D4A0',
          300: '#D9BB6E',
          400: '#D4AF37',
          500: '#C5A059',
          600: '#B8923F',
          700: '#997532',
          800: '#7A5D28',
          900: '#5C461E',
          950: '#3A2A12',
        },
        atlas: {
          black: '#000000',
          gold: '#C5A059',
          'gold-light': '#D4AF37',
          'gold-dark': '#997532',
          success: '#2E7D32',
          border: '#E0E0E0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        script: ['"Great Vibes"', 'cursive'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
