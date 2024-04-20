import { useState } from "react";

import en from './locales/en.json';
import es from './locales/es.json';

// define Type?
// add english as key and translation as value
// how can we use this in react applications
// within out team, what are our do's and don'ts when building plugins
const translations: any = {
  en,
  es,
};

/*
export const getTranslation = (locale: string, key: string) => {
  return translations[locale][key];
}
*/

export const LanguageSelector = () => {
  const initialLocale = navigator.language.split('-')[0];
  const [locale, setLocale] = useState(initialLocale);

  const translate = (key: string) => {
    return translations[locale][key];
  }

  const changeLanguage = (evt: any) => {
    setLocale(evt.target.value);
  }

  return (
    <>
      <select
        className="select w-full max-w-xs mr-6 rounded-none"
        onChange={changeLanguage}
      >
        <option value="en">English</option>
        <option value="es">Spanish</option>
      </select>

      {/*
        export outside of component
        - usage: wrap in text
      */}
      {translate('greeting')}
    </>
  )
};

export default LanguageSelector;
