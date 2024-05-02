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
  C12_SERVER_SIDE_RENDERING,
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
  const translate = useI18nTranslate()
  const initialSelected = C3_CLEANING_CODE
  const [selected, setSelected] = useState(initialSelected)

  const columns = [
    { name: `${translate('howtoField')}`, field: "problem" },
    { name: `${translate('solutionLabel')}`, field: "title" }
  ]

  const notesNav = {
    "React 18 Design Patterns and Best Practices": [
      { id: 'c3', title: 'Cleaning up code', data: C3_CLEANING_CODE },
      { id: 'c4', title: 'Exploring Popular Composition Patterns', data: C4_POPULAR_COMPOSITION },
      { id: 'c5', title: 'Writing Code for the Browser', data: C5_WRITING_CODE_FOR_THE_BROWSER },
      { id: 'c7', title: 'Anti-Patterns to be Avoided', data: C7_ANTIPATTERNS_TO_BE_AVOIDED },
      { id: 'c8', title: 'React Hooks', data: C8_REACT_HOOKS },
      { id: 'c9', title: 'React Router', data: C9_REACT_ROUTER },
      { id: 'c10', title: 'React 18 New Features', data: C10_REACT_18_NEW_FEATURES},
      { id: 'c11', title: 'Managing Data', data: C11_MANAGING_DATA},
      { id: 'c12', title: 'Server-side Rendering', data: C12_SERVER_SIDE_RENDERING }
    ],
    "A Common-Sense Guide to Data Structures and Algorithms": []
  }

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 text-right">
          <I18nLangSelect />
        </div>

        <div className="col-span-3">
          {/** TODO: convert to Menu component */}
          <ul className="menu menu-sm bg-base-200">
            { Object.keys(notesNav).map((key: string) =>
              <li key={key}>
                <h2 className="menu-title">{key}</h2>
                <ul className="menu menu-sm bg-base-200">
                  {notesNav[key as keyof typeof notesNav].map((chapter: any) =>
                    <li key={chapter.id}>
                      <a
                        className="rounded-none"
                        onClick={() => setSelected(chapter.data)}
                      >
                        {chapter.title}
                      </a>
                    </li>
                  )}
                </ul>
              </li>
            )}
          </ul>
        </div>

        <div className="col-span-9">
          <Table
            columns={columns}
            rows={selected}
          >
            {(customRows: any) => customRows.map((item: any, index: number) =>
              <tr key={index}>
                <td className="align-text-top min-w-96">
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
