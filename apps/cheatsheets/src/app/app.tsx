// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import {
  Header,
  Layout
} from '@reincodes/ui';
import {
  C3_CLEANING_CODE,
  C4_POPULAR_COMPOSITION
} from '../constants';
import {
  useState
} from 'react';
import { ViewCode } from './features';

/*
  TODO:
  - implement TS
  - create Table UI component
  - create sidebar navigation UI component
*/


export function App() {
  const initialSelected = C3_CLEANING_CODE
  const [selected, setSelected] = useState(initialSelected)

  const chaptersNav = [
    {
      id: 'c3',
      title: 'Cleaning up code',
      data: C3_CLEANING_CODE
    },
    {
      id: 'c4',
      title: 'Popular Composition Patterns',
      data: C4_POPULAR_COMPOSITION
    }
  ]

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-6 grid grid-cols-6">
        <div className="col-span-1">
          <ul>
            {chaptersNav.map((item) =>
              <li key={item.id}>
                <a onClick={() => setSelected(item.data)}>{item.title}</a>
              </li>
            )}
          </ul>
        </div>

        <div className="col-span-5">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Desc</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((item, index) =>
                  <tr key={index}>
                    <td className="align-text-top">
                      <ViewCode
                        title={item.title}
                        sample={item.sample}
                      />
                    </td>
                    <td className="align-text-top">
                      {item.desc}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default App;
