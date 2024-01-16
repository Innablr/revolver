module.exports = {
  env: {
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
    'plugin:json/recommended',
  ],
  overrides: [
    {
      files: '*.js',
      rules: {
        'prettier/prettier': ['warn'],
      }
    },
    {
      files: '*.json',
      rules: {
        'json/*': ['warn']
      }
    },
    {
      files: 'test/**',
      plugins: ['mocha'],
      extends: [
        'plugin:mocha/recommended',
        'plugin:prettier/recommended',
      ],
      rules: {
        'mocha/no-setup-in-describe': ['off'],
        'prettier/prettier': ['warn'],
      }
    }
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    'import/no-extraneous-dependencies': 'warn',
    'import/no-commonjs': 'warn',
    'import/no-amd': 'error',
    'import/no-absolute-path': 'error',
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-var-requires': 'warn',
  },
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
};
