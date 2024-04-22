import {
  FC,
  createContext,
  useState,
  useCallback,
  useContext
} from "react";

/*
  NOTE:
  - Create plugin in React
  ref: https://stackoverflow.com/questions/72562934/creating-plugins-in-react
  - How to handle multiple Context
  ref: https://stackoverflow.com/questions/53346462/react-multiple-contexts
*/

// within our team, what are our do's and don'ts when building plugins

interface i18nProvider {
  children?: any
  initialLocale: string
  resources: object
}

interface i18nContext {
  locale: string
  setLocale: any
  initialLocale: string
  resources: object
}


// CREATE context
export const I18nContext = createContext<i18nContext>({
  locale: '',
  setLocale: null,
  initialLocale: '',
  resources: {},
});


// CREATE provider
export const I18nProvider: FC<i18nProvider> = ({ children, initialLocale, resources }) => {
  // state
  const [locale, setLocale] = useState(initialLocale);

  // set the values we want to expose to child components
  const context = {
    locale,
    setLocale,
    initialLocale,
    resources,
  }

  return (
    <I18nContext.Provider value={context}>
      {children}
    </I18nContext.Provider>
  )
}


// CREATE custom component to allow user to interact with context
export const I18nLangSelect = () => {
  // get context we'll need
  const { resources, locale, setLocale } = useContext(I18nContext);

  // wrapping event with useCallback to memoize function.
  // this is for performance optimization
  const changeLanguage = useCallback((event: any) => {
    setLocale(event.target.value);
  }, [setLocale])

  return (
    <>
      <select
        className="select w-full max-w-xs mr-6 rounded-none"
        value={locale}
        onChange={changeLanguage}
      >
        {Object.entries(resources).map(([key, dict]) => (
          <option key={key} value={key}>
            {dict.langSelectLabel}
          </option>
        ))}
      </select>
    </>
  )
}


// CREATE custom hook to simplify working with data
export const useI18nTranslate = () => {
  const { resources, locale } = useContext(I18nContext)

  return (key: any) => {
    return resources[locale as keyof typeof resources][key]
  }
}
