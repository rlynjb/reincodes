// eslint-disable-next-line @typescript-eslint/no-unused-vars
import styles from './app.module.css';
import { Header, Layout } from '@reincodes/ui'
import {
  experiences,
  projects,
} from '../constants';
import parse from 'html-react-parser';

export function App() {
  return (
    <Layout>
      <Header />

      <div className="intro container mx-auto py-8">
        <h1 className="text-yellow text-5xl">hello, i'm rein.</h1>

        <p className="my-6">
          With over 6 years of hands-on experience in building complex web-based user interfaces using JavaScript, CSS, and HTML, I have extensive experience with: Vue.js, React.js, Next.js, Nuxt.js, Typescript, Primereact, Tailwind CSS, Daisy UI, and REST APIs.
        </p>

        <p className="my-6">
          I possess a deep understanding of front-end architecture and build processes, including npm, yarn, webpack, and Monorepo setups with Micro-Frontend Architecture, NX, and Turborepo.
        </p>

        <p className="my-6">
          I am also familiar with Unit Testing, Ember.js, Laravel, Rancher, Jenkins, Bash, Vim, Git, Microservices, Containers, WordPress, and Grav (Static Site Generators), and have experimented with GraphQL and Apollo Client/Server.
        </p>
      </div>

      <div className='experiences container mx-auto py-8'>
        <h5 className="text-yellow">Here's some of my latest exprience..</h5>

        { experiences.map((exp, index) => (
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
              <img className="h-64" src={project.thumb} />
              <h6 className="text-slate my-2">{project.title}</h6>
              <p className="text-xs">
                {parse(project.desc)}
              </p>
              <a
                href={project.link}
                target="_blank"
                className="text-yellow mt-4"
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
