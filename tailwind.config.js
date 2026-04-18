/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'gansid-primary': '#ba0028',
                'gansid-primary-container': '#E0243C',
                'gansid-secondary': '#2260a1',
                'gansid-surface': '#f9f9f9',
                'gansid-surface-container-low': '#f3f3f3',
                'gansid-surface-container-lowest': '#FDFDFD',
                'gansid-on-surface': '#1a1c1c',
                'gansid-outline-variant': '#e5bdbc',
            },
            fontFamily: {
                'display': ['Outfit', 'system-ui', 'sans-serif'],
                'body': ['DM Sans', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                'gansid-md': '1.5rem',
                'gansid-lg': '2rem',
                'gansid-xl': '3rem',
            },
            backdropBlur: {
                'viscous': '24px',
            },
            backgroundImage: {
                'gansid-primary-gradient': 'linear-gradient(135deg, #ba0028, #E0243C)',
            },
            boxShadow: {
                'invisible-lift': '0 0 64px -12px rgba(26, 28, 28, 0.06)',
            },
            transitionTimingFunction: {
                'viscous': 'cubic-bezier(0.8, 0, 0.2, 1)',
            },
        },
    },
    plugins: [],
}
