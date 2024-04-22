import { useState, FC } from "react";

import en from './locales/en.json';
import es from './locales/es.json';

/*
  NOTE:
  - Create plugin in React
  ref: https://stackoverflow.com/questions/72562934/creating-plugins-in-react
*/

// define Type?
// add english as key and translation as value
// how can we use this in react applications
// within out team, what are our do's and don'ts when building plugins

interface Props {

}

export const LanguageSelector: FC<Props> = () => {
  const initialLocale = navigator.language.split('-')[0];
  const [locale, setLocale] = useState(initialLocale);

  const translations: any = {
    en,
    es,
  };

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
