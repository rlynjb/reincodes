// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import {
  Header,
  Layout
} from '@reincodes/ui';
import {
  C3_CLEANING_CODE,
  C4_POPULAR_COMPOSITION,
  C5_WRITING_CODE_FOR_THE_BROWSER,
  C7_ANTIPATTERNS_TO_BE_AVOIDED,
  C8_REACT_HOOKS,
  C9_REACT_ROUTER,
  C10_REACT_18_NEW_FEATURES,
  C11_MANAGING_DATA,
} from '../constants';
import {
  useState
} from 'react';
import { ViewNote } from './features';
import {
  Button,
  Table,
} from "./ui"
import {
  I18nLangSelect,
  useI18nTranslate,
} from "./utils/i18n"

/*
  TODO:
  - review code and implement TS
  - create sidebar navigation UI component
*/

interface Note {
  problem: string
  title: string
  desc?: string
  sample?: string
}

export function App() {
  const initialSelected = C3_CLEANING_CODE
  const [selected, setSelected] = useState(initialSelected)
  const columns = [
    { name: "How to", field: "problem" },
    { name: "Solution", field: "title" }
  ]

  const chaptersNav = [
    { id: 'c3', title: 'Cleaning up code', data: C3_CLEANING_CODE },
    { id: 'c4', title: 'Exploring Popular Composition Patterns', data: C4_POPULAR_COMPOSITION },
    { id: 'c5', title: 'Writing Code for the Browser', data: C5_WRITING_CODE_FOR_THE_BROWSER },
    { id: 'c7', title: 'Anti-Patterns to be Avoided', data: C7_ANTIPATTERNS_TO_BE_AVOIDED },
    { id: 'c8', title: 'React Hooks', data: C8_REACT_HOOKS },
    { id: 'c9', title: 'React Router', data: C9_REACT_ROUTER },
    { id: 'c10', title: 'React 18 New Features', data: C10_REACT_18_NEW_FEATURES},
    { id: 'c11', title: 'Managing Data', data: C11_MANAGING_DATA}
  ]

  const translate = useI18nTranslate()

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-12 grid grid-cols-6 gap-4">
        <div className="col-span-6">
          <I18nLangSelect />
          {translate('greeting')}
        </div>

        <div className="col-span-1 pt-14">
          <ul>
            {chaptersNav.map((item) =>
              <li
                key={item.id}
                className="mb-4"
              >
                <Button
                  onClick={() => setSelected(item.data)}
                >
                  {item.title}
                </Button>
              </li>
            )}
          </ul>
        </div>

        <div className="col-span-5">
          <Table
            columns={columns}
            rows={selected}
          >
            {(customRows: any) => customRows.map((item: any, index: number) =>
              <tr key={index}>
                <td className="align-text-top w-96">
                  {item.problem ? item.problem : ''}
                </td>
                <td className="align-text-top">
                  <ViewNote
                    title={item.title}
                    desc={item.desc}
                    sample={item.sample}
                  />
                </td>
              </tr>
            )}
          </Table>
        </div>
      </div>
    </Layout>
  );
}

export default App;
