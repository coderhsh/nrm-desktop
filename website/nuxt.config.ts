import { defineNuxtConfig } from 'nuxt/config'
import { prerenderRoutes } from './app/lib/site-runtime'
import { siteConfig } from './app/site.config'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-01',
  srcDir: 'app',
  css: ['~/assets/style.css'],
  app: {
    baseURL: siteConfig.baseUrl,
    head: {
      title: siteConfig.siteName,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { property: 'og:type', content: 'website' },
      ],
    },
  },
  nitro: {
    prerender: {
      routes: ['/', ...prerenderRoutes],
    },
  },
  typescript: {
    strict: true,
  },
})
