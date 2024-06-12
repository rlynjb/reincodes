import {
  Link,
} from "react-router-dom";
import {
  useBreadcrumbs,
} from "../ui"

export default function AboutPage() {
  useBreadcrumbs([
    {
      label: 'Home',
      link: '/'
    },
    {
      label: 'Notes',
      link: '/cheatsheets'
    },
    {
      label: 'About',
      link: '/cheatsheets/about'
    }
  ])

  return (
    <div id="about-page"
      className="h-screen grid grid-cols-1 gap-4 content-center"
    >
      <div className="place-self-center text-center">
        <h1 className="text-4xl">About</h1>
        <p className="my-8">This is a cheatsheet app.</p>
        <p>
          <i>Version 1.0.0</i>
        </p>
        <Link to="/cheatsheets" className="text-white underline">
          Home
        </Link>
      </div>
    </div>
  )
}
