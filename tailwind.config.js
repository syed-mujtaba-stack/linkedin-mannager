import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#25263a',
        muted: '#7b7d92',
        violet: '#6c5ce7',
      },
      boxShadow: {
        soft: '0 16px 48px rgba(36, 31, 78, .08)',
        card: '0 5px 24px rgba(36, 31, 78, .045)',
      },
    },
  },
  plugins: [typography],
};
