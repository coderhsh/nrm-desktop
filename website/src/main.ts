import { createApp } from 'vue'
import AppRoot from './AppRoot.vue'
import { router } from './router'
import './style.css'

const app = createApp(AppRoot)
app.use(router)
app.mount('#app')
