import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

import App from './app/app';
import ErrorPage from './app/pages/error-page';
import AboutPage from './app/pages/about-page';

import { I18nProvider } from './app/utils/i18n';
import { translations } from './constants/translations';

import { BreadcrumbsProvider } from './app/ui';


const router = createBrowserRouter([
  {
    path: "/cheatsheets",
    element: <App />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/cheatsheets/about",
    element: <AboutPage />,
    errorElement: <ErrorPage />,
  },
]);


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <I18nProvider
      initialLocale="en"
      translations={translations}
    >
      <BreadcrumbsProvider>
        <RouterProvider router={router} />
      </BreadcrumbsProvider>
    </I18nProvider>
  </StrictMode>
);
