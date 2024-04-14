// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import { Header, Layout } from '@reincodes/ui'

export function App() {
  const expriences = [
    {
      company: 'Switch',
      date: 'August 2017 - Present // Las Vegas, NV',
      desc: [
        'Knowledge of development and deployment pipeline.',
        'Knowledge of development history of existing applications.',
        'Collaborate with back-end developers.',
        'Implement back-end APIs in front-end apps.',
        'Communicate with managers for project requirements.',
        'Trained new hires',
        'Reversed engineer and documented existing applications using knowledge of UML System Design.',
        'Projects I took ownership (See resume for full description..)'
      ]
    },
    {
      company: 'JS Products',
      date: 'June 2016 - August 2017 // Las Vegas, NV',
      desc: [
        'Developed impressive public facing websites using Grav, Laravel, Zurb Foundation.',
        'Collaborated with stakeholders for updates and changes of their websites.',
        'Collaborated with UI/UX Designers using InVision.',
        'Helped the company keep up to date with current web technology.',
        'Developed a theme starter kit that is customed to company’s design guideline.',
        'Developed a “Personlized your Ratchet Set” web app for Kobalttools.com using JavaScript.'
      ]
    }
  ]

  const projects = [
    {
      title: 'Portfolio Microfrontend',
      desc: 'Microfrontend architecture, NX, React, TailwindCSS, Netlify',
      link: 'https://reincodes.netlify.app/',
      thumb: '../assets/portfolio.png'
    },
    {
      title: 'UI Design System',
      desc: 'Vue3, TailwindCSS, DaisyUI, Github Pages',
      link: 'https://rlynjb.github.io/uidesign/',
      thumb: '../assets/ui_system_design.png'
    },
    {
      title: 'SpaceX Seat Reservation',
      desc: 'React, Apollo GraphQL, Netlify Functions, MongoDB',
      link: 'https://spacex-reserve-seat.netlify.app/',
      thumb: '../assets/spacex.png'
    },
    {
      title: 'Persopo - Public Record Search',
      desc: 'Ember.js, Golang',
      link: 'https://persopo.com/',
      thumb: '../assets/persopo.png'
    }
  ]

  return (
    <Layout>
      <Header />

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

        { expriences.map((exp, index) => (
          <div key={index} className='my-6'>
            <h6 className="text-slate">{exp.company}</h6>
            <b>{exp.date}</b>
            <ul className="list-disc ml-6 mt-2 text-sm">
              { exp.desc.map((desc, index) => (
                <li key={index}>{desc}</li>
              )) }
            </ul>
          </div>
        ))}
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
          { projects.map((project, index) => (
            <div key={index}>
              <img className="max-h-64" src={project.thumb} />
              <h6 className="text-slate mb-2">{project.title}</h6>
              <p className="text-xs">{project.desc}</p>
              <a
                href={project.link}
                target="_blank"
                className="text-yellow"
              >
                Visit
              </a>
            </div>
          )) }
        </div>
      </div>
    </Layout>
  );
}

export default App;
