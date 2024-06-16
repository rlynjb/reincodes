// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import {
  Header,
  Layout
} from '@reincodes/ui';
import {
  MenuWithTitle,
  Breadcrumbs,
  useBreadcrumbs,
} from "./ui"
import { notesNav } from '../constants';
import { useState } from 'react';
import { Link } from "react-router-dom";
import { ViewChapterNotes } from './features';
import { I18nLangSelect } from "./utils/i18n"


/**
 * TODO:
 * - implement router or ability to remember which item was selected for certain time period
 * -- so when browser is refreshed, it will remember the selected item
 * - add ability to edit notes
 *
 * - add simple note/desc to the top of page
 * - add ability to search notes
 * - add ability to filter notes by book or chapter
 * - add ability to add new notes
 * - add ability to delete notes
 * - add ability to share notes
 *
 * backlog:
 * - add ability to bookmark a note or just a important reminder feature
 * - add theme switcher with option of light and dark mode
 * - ex. https://cheatsheets.netlify.app/sheet/react/
 * - add ability to sort nav items by book or chapter
 * - improve UI table note section
 */


export function App() {
  const initialSelected = Object.values(notesNav)[0][0] // get first item in an object
  const [selected, setSelected] = useState(initialSelected)

  useBreadcrumbs([
    {
      label: 'Home',
      link: '/'
    },
    {
      label: 'Notes',
      link: '/cheatsheets'
    }
  ])

  return (
    <Layout>
      <Header />

      <div className="container mx-auto mt-12 grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <Breadcrumbs />
        </div>
        <div className="col-span-1">
          <Link to="/cheatsheets/about" className="text-white underline">
            About
          </Link>
        </div>
        <div className="col-span-11 text-right">
          <I18nLangSelect />
        </div>

        <div className="col-span-3">
          <MenuWithTitle
            navItems={notesNav}
            initialItem={initialSelected}
            selectedItem={(item: any) => setSelected(item)}
          />
        </div>

        <div className="col-span-9">
          <ViewChapterNotes selected={selected.data} />
        </div>
      </div>
    </Layout>
  );
}

export default App;
