module.exports = {
  extends: ['@vertexvis/vertexvis-typescript', 'plugin:promise/recommended'],
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['eslint-plugin-tsdoc', 'promise', 'simple-import-sort'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'warn',
    'no-await-in-loop': 'warn',
    'no-return-await': 'warn',
    'require-await': 'warn',
    'simple-import-sort/imports': 'warn',
  },
};
