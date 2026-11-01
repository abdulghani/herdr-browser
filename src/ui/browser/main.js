import { Electroview } from 'electrobun/view';
import { mount } from 'svelte';
import { createBridge } from '../lib/bridge.js';
// The same preload every page gets, so the browser's keys work while this page has the focus.
import '../page-preload.js';
import App from './App.svelte';
import './app.css';

const platform = navigator.platform.startsWith('Mac') ? 'darwin' : 'linux';
Object.assign(window, createBridge(Electroview, platform));

mount(App, { target: document.body });
