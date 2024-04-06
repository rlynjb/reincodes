// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';

export function App() {
  return (
    <div className="bg-primary text-secondary h-fit pb-20">
      <header className="container mx-auto py-2 bg-primary text-secondary grid grid-cols-2 items-center">
        <div>
          <b className='mr-6 text-yellow'>reincodes</b>
          <p className='inline-block'>my portfolio and codebook</p>
        </div>
        <div className='text-right'>
          <a className="inline-block py-2 px-4" href="/">Intro</a>
          <a className="inline-block py-2 px-4" href="/uids/">UIDS</a>
        </div>
      </header>

      <div className="intro container mx-auto py-8">
        <h1 className="text-yellow">hello, i'm rein.</h1>

        <p className="my-6">
          I’m a software engineer specializing in front-end with an objective of lead. I have about 6+ years professional experience with common front-end technologies such as: JavaScript/ES6, HTML/CSS, Vue, Node. And have worked within a software development team, using JIRA, daily stand ups, and weekly meetings.
        </p>

        <p className="my-6">
          I've also gained experience of development and deployment pipeline usings tools such as: Git, Vim/Bash, Gitlab for code management and reviews. Rancher/Nerdctrl or Docker CLI, Jenkins to push code/features to dev and production.
        </p>

        <p className="my-6">
          My goal is to be really good in System Design and Data Structure and Algorithms. Also, below are additional languages, frameworks, tools I've touched over the years..
        </p>

        <div className="skills">
          <span>Typescript</span>,
          <span>Vue3</span>, Tailwind/Daisy UI, Nuxt3, Next.js, React, Quasar Framework, Laravel, Netlify, Monorepo architecture, NX
        </div>
      </div>

      <div className='experiences container mx-auto py-8'>
        <h5 className="text-yellow">Here's some of my exprience..</h5>

        <div className='my-6'>
          <h6 className="text-slate">Switch</h6>
          <b>August 2017 - Present // Las Vegas, NV</b>
          <ul className="list-disc ml-6 mt-2 text-sm">
            <li>Knowledge of development and deployment pipeline.</li>
            <li>Knowledge of development history of existing applications.</li>
            <li>Collaborate with back-end developers.</li>
            <li>Implement back-end APIs in front-end apps.</li>
            <li>Communicate with managers for project requirements.</li>
            <li>Trained new hires</li>
            <li>Reversed engineer and documented existing applications using knowledge of UML System Design.</li>
            <li>Projects I took ownership (See resume for full description..)</li>
          </ul>
        </div>

        <div className='my-6'>
          <h6 className="text-slate">JS Products</h6>
          <b>June 2016 - August 2017 // Las Vegas, NV</b>
          <ul className="list-disc ml-6 mt-2 text-sm">
            <li>Developed impressive public facing websites using Grav, Laravel, Zurb Foundation.</li>
            <li>Collaborated with stakeholders for updates and changes of their websites.</li>
            <li>Collaborated with UI/UX Designers using InVision.</li>
            <li>Helped the company keep up to date with current web technology.</li>
            <li>Developed a theme starter kit that is customed to company’s design guideline.</li>
            <li>Developed a “Personlized your Ratchet Set” web app for Kobalttools.com using JavaScript.</li>
          </ul>
        </div>
      </div>

      <div className="resume container mx-auto p-8 bg-tertiary">
        <p>
          and for complete history, here's my
          <a
            className="text-yellow ml-1"
            target="_blank"
            href="https://docs.google.com/document/d/1LOO_sdXimhxD43TeWSkoZbqASsT3B68l9YAdkyxmwNU/edit?usp=share_link"
          >
            Resume ✓
          </a>
        </p>
        <p>I’m currently looking for new opportunities, preferably remote and looking forward to accepting projects.</p>
        <p>
          If you have a question or just want to say hi, feel free to contact me via
          <a
            className="text-yellow ml-1"
            target="_blank"
            href="https://www.linkedin.com/in/rlynpro/"
          >
            LinkedIn ✓
          </a>
        </p>
      </div>

      <div className="projects container mx-auto py-8">
        <h5 className="text-yellow">and some projects I've worked on..</h5>
        <div className="mt-6 grid grid-cols-3 gap-6">
          <div>
            <img className="max-h-64" src="../assets/portfolio.png" />
            <h6 className="text-slate my-2">Portfolio Microfrontend</h6>
            <p className="text-xs">Microfrontend architecture, NX, React, TailwindCSS, Netlify</p>
            <a
              href="https://reincodes.netlify.app/"
              target="_blank"
              className="text-yellow"
            >
              Visit
            </a>
          </div>

          <div>
            <img className="max-h-64" src="../assets/ui_system_design.png" />
            <h6 className="text-slate my-2">UI Design System</h6>
            <p className="text-xs">Vue3, TailwindCSS, DaisyUI, Github Pages</p>
            <a
              href="https://rlynjb.github.io/uidesign/"
              target="_blank"
              className="text-yellow"
            >
              Visit
            </a>
          </div>

          <div>
            <img className="max-h-64" src="../assets/spacex.png" />
            <h6 className="text-slate my-2">SpaceX Seat Reservation</h6>
            <p className="text-xs">React, Apollo GraphQL, Netlify Functions, MongoDB</p>
            <a
              href="https://spacex-reserve-seat.netlify.app/"
              target="_blank"
              className="text-yellow"
            >
              Visit
            </a>
          </div>

          <div>
            <img className="max-h-64" src="../assets/persopo.png" />
            <h6 className="text-slate mb-2">Persopo - Public Record Search</h6>
            <p className="text-xs">Ember.js, Golang</p>
            <a
              href="https://persopo.com/"
              target="_blank"
              className="text-yellow"
            >
              Visit
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
