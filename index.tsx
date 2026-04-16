import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { CURRENT_SITE } from './config/sites';

document.title = CURRENT_SITE.pageTitle;
document.documentElement.style.setProperty('--site-primary', CURRENT_SITE.fallbackColors.primary);
document.documentElement.style.setProperty('--site-accent', CURRENT_SITE.fallbackColors.accent);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
