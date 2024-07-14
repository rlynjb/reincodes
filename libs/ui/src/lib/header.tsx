import '../styles.css';
import styles from './header.module.css';

/* eslint-disable-next-line */
export interface HeaderProps {}

export function Header(props: HeaderProps) {
  return (
    <div className={styles['container']}>
      <header className="container mx-auto py-4 bg-primary text-secondary grid grid-cols-2 items-center">
        <div>
          <a href="https://reincodes.netlify.app/">
            <b className='mr-6 text-yellow text-2xl'>
              reincodes
            </b>
          </a>
          <p className='inline-block text-slate'>Welcome to my portfolio :D</p>
        </div>
      </header>
    </div>
  );
}

export default Header;
