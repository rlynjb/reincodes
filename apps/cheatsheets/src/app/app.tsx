// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import {
  Header,
  Layout
} from '@reincodes/ui';
import {
  notesNav
} from '../constants';
import {
  useState
} from 'react';
import { ViewNote } from './features';
import {
  MenuWithTitle,
  Table,
} from "./ui"
import {
  I18nLangSelect,
  useI18nTranslate,
} from "./utils/i18n"

/**
 * TODO:
 * - implement router or ability to remember which item was selected for certain time period
 * - implement breadcrumb or highlight selected item or add simple title at the top
 *
 * backlog:
 * - add ability to bookmark a note or just a important reminder feature
 */


export function App() {
  const translate = useI18nTranslate()

  const columns = [
    { name: `${translate('howtoField')}`, field: "problem" },
    { name: `${translate('solutionLabel')}`, field: "title" }
  ]

  const initialSelected = Object.values(notesNav)[0][0] // get first item in an object
  const [selected, setSelected] = useState(initialSelected)


  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 text-right">
          <I18nLangSelect />
        </div>

        <div className="col-span-3">
          <MenuWithTitle
            navItems={notesNav}
            selectedItem={(item: any) => setSelected(item)}
          />
        </div>

        <div className="col-span-9">
          <Table
            columns={columns}
            rows={selected.data}
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
