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
} from '../constants';
import {
  useState
} from 'react';
import { ViewNote } from './features';
import {
  Button,
  Table,
} from "./ui"

/*
  TODO:
  - implement TS
  - create Table UI component
  - create sidebar navigation UI component
*/


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
  ]

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-6 grid grid-cols-6 gap-4">
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
            {(rows: any) => rows.map((item: any, index: number) =>
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
