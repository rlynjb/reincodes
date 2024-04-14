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


export function App() {
  const initialSelected = C3_CLEANING_CODE
  const [selected, setSelected] = useState(initialSelected)

  const chapters = {
    c3: C3_CLEANING_CODE,
    c4: C4_POPULAR_COMPOSITION
  } as any

  const handleNav = (chapter: string) => {
    setSelected(chapters[chapter])
  }

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-6 grid grid-cols-6">
        <div className="col-span-1">
          <ul>
            <li>
              <a onClick={() => handleNav('c3')}>Cleaning up code</a>
            </li>
            <li>
              <a onClick={() => handleNav('c4')}>Popular Composition Patterns</a>
            </li>
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
