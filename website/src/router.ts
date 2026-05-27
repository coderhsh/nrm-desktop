import { createRouter, createWebHashHistory } from 'vue-router'
import type { PageKey } from './lib/site'
import HomePage from './pages/HomePage.vue'
import DownloadPage from './pages/DownloadPage.vue'
import ConfigurationPage from './pages/ConfigurationPage.vue'
import ArchitecturePage from './pages/ArchitecturePage.vue'

export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
    meta: { page: 'home' satisfies PageKey },
  },
  {
    path: '/download',
    name: 'download',
    component: DownloadPage,
    meta: { page: 'download' satisfies PageKey },
  },
  {
    path: '/configuration',
    name: 'configuration',
    component: ConfigurationPage,
    meta: { page: 'configuration' satisfies PageKey },
  },
  {
    path: '/architecture',
    name: 'architecture',
    component: ArchitecturePage,
    meta: { page: 'architecture' satisfies PageKey },
  },
]

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, top: 100, behavior: 'smooth' }
    return { top: 0 }
  },
})
