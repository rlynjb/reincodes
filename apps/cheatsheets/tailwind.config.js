const { createGlobPatternsForDependencies } = require('@nrwl/react/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(
      __dirname,
      '{src,pages,components}/**/*!(*.stories|*.spec).{ts,tsx,html}'
    ),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#18181b',
        'secondary': '#a1a1aa',
        'tertiary': '#27272a',
        'yellow': '#ca8a04',
        'slate': '#64748b'
      }
    },
  },
  plugins: [
    require("daisyui")
  ],
};
