import addDynamicIconSelectors from '@iconify/tailwind';
import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  plugins: [
    addDynamicIconSelectors(), // 添加 Iconify 插件
    daisyui,        // daisyUI 插件
  ],
};