// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import {
  Header,
  Layout
} from '@reincodes/ui';
import {
  C3_CLEANING_CODE
} from '../constants';

export function App() {
  const cleaningUpCode = C3_CLEANING_CODE

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-6 grid grid-cols-6">
        <ul className="col-span-1">
          <li>
            <a href="">Cleaning up code</a>
          </li>
          <li>
            <a href="">Patterns</a>
          </li>
        </ul>

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
                {cleaningUpCode.map((item, index) =>
                  <tr key={index}>
                    <td className="align-text-top">
                      <div className="collapse bg-base-200 rounded-none">
                        <input type="checkbox" className="min-h-fit"/>
                        <div className="collapse-title text-sm p-2 min-h-fit">
                          {item.title}
                        </div>
                        <div className="collapse-content">
                          <pre className="text-xs">
                              {item.sample}
                          </pre>
                        </div>
                      </div>
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
