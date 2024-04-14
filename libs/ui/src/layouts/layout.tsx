import styles from './layout.module.css';

/* eslint-disable-next-line */
export interface LayoutProps {}

export function Layout({ children }: React.PropsWithChildren<LayoutProps>) {
  return (
    <div className="bg-primary text-secondary h-full pb-20">
      { children }
    </div>
  );
}

export default Layout;
