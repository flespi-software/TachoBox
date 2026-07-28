import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import pluginQuasar from '@quasar/app-vite/eslint'
import prettierSkipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  ...pluginQuasar.configs.recommended(),
  js.configs.recommended,

  // https://eslint.vuejs.org
  ...pluginVue.configs['flat/essential'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.browser,
        ...globals.node, // config files
        process: 'readonly', // process.env.*
        __APP_VERSION__: 'readonly',
        __APP_NAME__: 'readonly',
        __APP_PRODUCT__: 'readonly',
      },
    },

    rules: {
      'prefer-promise-reject-errors': 'off',

      // allow debugger during development only
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },

  prettierSkipFormatting,
]
