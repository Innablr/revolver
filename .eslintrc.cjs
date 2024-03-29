module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc'],
  root: true,
  rules: {
    'import/no-extraneous-dependencies': 'warn',
    'import/no-commonjs': 'warn',
    'import/no-amd': 'error',
    'import/no-absolute-path': 'error',
    'prettier/prettier': ['warn', { endOfLine: 'auto' }],
    '@typescript-eslint/no-explicit-any': 'off',
    'tsdoc/syntax': 'warn',
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
      node: true,
    },
  },
};
