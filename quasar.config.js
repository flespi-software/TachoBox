// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig((ctx) => {
  return {
    // app boot files (/src/boot) - run before the root Vue instance is mounted
    boot: ['i18n', 'flespi-io'],

    css: ['app.scss'],

    extras: ['mdi-v7', 'roboto-font'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      extendViteConf(config) {
        config.base = './'
      },

      vueRouterMode: 'hash', // available values: 'hash', 'history'

      // build-time constants, injected from package.json
      rawDefine: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_NAME__: JSON.stringify(pkg.name),
        __APP_PRODUCT__: JSON.stringify(pkg.productName),
      },

      vitePlugins: [
        [
          '@intlify/unplugin-vue-i18n/vite',
          {
            ssr: ctx.modeName === 'ssr',
            include: [fileURLToPath(new URL('./src/i18n', import.meta.url))],
          },
        ],

        [
          'vite-plugin-checker',
          {
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      port: 8189,
      open: true, // opens browser window automatically
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {
        dark: true,
      },

      iconSet: 'mdi-v7',

      // Quasar plugins
      plugins: ['Loading', 'Notify', 'Dialog', 'LocalStorage', 'SessionStorage'],
    },

    // https://v2.quasar.dev/options/animations
    animations: [],
  }
})
