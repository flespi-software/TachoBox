import { defineBoot } from '#q-app/wrappers'
import { createI18n } from 'vue-i18n'
import messages from 'src/i18n'

export default defineBoot(({ app }) => {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const lang = params.get('lang')
  const supported = Object.keys(messages)
  const locale = supported.includes(lang) ? lang : 'en-US'

  const i18n = createI18n({
    locale,
    fallbackLocale: 'en-US',
    globalInjection: true,
    messages,
  })

  app.use(i18n)
})
