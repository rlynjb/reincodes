// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import { Header } from '@reincodes/ui'

export function App() {
  return (
    <div className="bg-primary text-secondary h-screen h-full pb-20">
      <Header />

      <div className="container mx-auto text-center py-6">
        <h3>Coming soon...</h3>
      </div>
    </div>
  );
}

export default App;
