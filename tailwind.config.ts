import addDynamicIconSelectors from '@iconify/tailwind';

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  plugins: [
    addDynamicIconSelectors(), // 添加 Iconify 插件
    require('daisyui'),        // daisyUI 插件
  ],
};