import {
	createSSRApp
} from "vue";
import { createPinia } from 'pinia';
import App from "./App.vue";
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';

export function createApp() {
	const app = createSSRApp(App);
	app.use(createPinia());
	app.use(Antd);
	return {
		app,
	};
}
