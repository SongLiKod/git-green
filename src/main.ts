import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import Vant from 'vant'
import 'element-plus/dist/index.css'
import 'vant/lib/index.css'
import './assets/theme.css'
import './assets/element-vars.css'
import './assets/vant-vars.css'
import router from './router'
import { createPinia } from 'pinia'
import { useThemeStore } from './stores/useThemeStore'

const app = createApp(App)
app.use(ElementPlus)
app.use(Vant)
app.use(createPinia())
app.use(router)

const themeStore = useThemeStore()
themeStore.initTheme()

app.mount('#app')
