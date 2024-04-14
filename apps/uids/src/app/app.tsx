// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import { Header, Layout } from '@reincodes/ui'

export function App() {
  return (
    <Layout>
      <Header />

      <div className="container mx-auto text-center py-6">
        <h3>Coming soon...</h3>
      </div>
    </Layout>
  );
}

export default App;
