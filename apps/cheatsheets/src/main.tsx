import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app/app';

import {
  I18nProvider
} from './app/utils/i18n';

const i18nInit = {
  en: {
    "langSelectLabel": "English",
    "greeting": "Hello, world!",
    "changeLanguage": "Change language"
  },
  es: {
    "langSelectLabel": "Spanish",
    "greeting": "¡Hola, mundo!",
    "changeLanguage": "Cambiar idioma"
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <I18nProvider
      initialLocale="en"
      resources={i18nInit}
    >
      <App />
    </I18nProvider>
  </StrictMode>
);
