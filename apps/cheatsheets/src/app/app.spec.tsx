import { render } from '@testing-library/react';

import App from './app';

jest.mock('./utils/i18n', () => {
  return {
    I18nLangSelect: () => <div />,
    useI18nTranslate: () => (key: string) => key,
    translate: () => (key: string) => key,
  }
})

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);

    expect(baseElement).toBeTruthy();
  });
});
