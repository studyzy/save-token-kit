import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'save-token/'],
  },
  ...tseslint.configs.recommended,
]
