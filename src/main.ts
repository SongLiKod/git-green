import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/theme.css'
import './assets/element-vars.css'
import router from './router'
import { createPinia } from 'pinia'
import { useThemeStore } from './stores/useThemeStore'

const app = createApp(App)
app.use(ElementPlus)
app.use(createPinia())
app.use(router)

const themeStore = useThemeStore()
themeStore.initTheme()

app.mount('#app')
