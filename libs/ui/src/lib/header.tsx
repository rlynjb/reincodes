import '../styles.css';
import styles from './header.module.css';

/* eslint-disable-next-line */
export interface HeaderProps {}

export function Header(props: HeaderProps) {
  return (
    <div className={styles['container']}>
      <header className="container mx-auto py-2 bg-primary text-secondary grid grid-cols-2 items-center">
        <div>
          <b className='mr-6 text-yellow'>reincodes</b>
          <p className='inline-block'>my portfolio and codebook</p>
        </div>
        <div className='text-right'>
          <a className="inline-block py-2 px-4" href="/">Intro</a>
          <a className="inline-block py-2 px-4" href="/cheatsheets/">Cheatsheets</a>
          <a className="inline-block py-2 px-4" href="/uids/">UIDS</a>
        </div>
      </header>
    </div>
  );
}

export default Header;
