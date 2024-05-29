/**
 * USAGE:
 * Wrap the root component with I18nProvider and pass in the initialLocale and translations.
 *
 * import { I18nProvider } from './app/utils/i18n';
 *
 * const i18nInit = {
 *  en: {
 *    "langSelectLabel": "English",
 *    "greeting": "Hello, world!",
 *    "changeLanguage": "Change language"
 *  },
 *  es: {
 *    "langSelectLabel": "Spanish",
 *    "greeting": "¡Hola, mundo!",
 *    "changeLanguage": "Cambiar idioma"
 *  }
 * }
 *
 * <I18nProvider
 *  initialLocale="en"
 *  translations={i18nInit}
 * >
 *  <App />
 * </I18nProvider>
 *
 * ------
 *
 * Use I18nLangSelect component to provide a dropdown to change language.
 *
 * import { I18nLangSelect } from "./utils/i18n"
 *
 * <I18nLangSelect />
 *
 * ------
 *
 * Use useI18nTranslate hook to translate text.
 * Pass in key define in the translations object.
 *
 * {translate('greeting')}
 *
 * ------
 *
 * NOTE:
 * Create plugin in React
 * ref: https://stackoverflow.com/questions/72562934/creating-plugins-in-react
 * How to handle multiple Context
 * ref: https://stackoverflow.com/questions/53346462/react-multiple-contexts
 * Using React Context in Nextjs Server Side Rendering
 * ref: https://dev.to/codingbrowny/using-context-providers-in-nextjs-server-components-2gk4
 */

"use client";

import {
  FC,
  createContext,
  useState,
  useCallback,
  useContext,
  ReactNode
} from "react";


interface i18nProvider {
  children?: ReactNode
  initialLocale: string
  translations: object
}

interface i18nContext {
  locale: string
  setLocale: any
  initialLocale: string
  translations: object
}


/**
 * Define Context
 */
export const I18nContext = createContext<i18nContext>({
  locale: '',
  setLocale: null,
  initialLocale: '',
  translations: {},
});


/**
 * Create Provider to wrap around the root component
 */
export const I18nProvider: FC<i18nProvider> = ({ children, initialLocale, translations }) => {
  // state
  const [locale, setLocale] = useState(initialLocale);

  // set the values we want to expose to child components
  const context = {
    locale,
    setLocale,
    initialLocale,
    translations,
  }

  return (
    <I18nContext.Provider value={context}>
      {children}
    </I18nContext.Provider>
  )
}


/**
 * Provide Custom Component to allow user to interact with context
 */
export const I18nLangSelect = () => {
  // get context we'll need
  const { translations, locale, setLocale } = useContext(I18nContext);

  // wrapping event with useCallback to memoize function.
  // this is for performance optimization
  const changeLanguage = useCallback((event: any) => {
    setLocale(event.target.value);
  }, [setLocale])

  return (
    <>
      <select
        className="select max-w-xs rounded-none"
        value={locale}
        onChange={changeLanguage}
      >
        {Object.entries(translations).map(([key, dict]) => (
          <option key={key} value={key}>
            {dict.langSelectLabel}
          </option>
        ))}
      </select>
    </>
  )
}


/**
 * Provide Custom Hook to simplify working with data
 *
 * TODO:
 * Transfer this to it a .ts file
 */
export const useI18nTranslate = () => {
  const { translations, locale } = useContext(I18nContext)

  return (key: string) => {
    return translations[locale as keyof typeof translations][key]
  }
}
