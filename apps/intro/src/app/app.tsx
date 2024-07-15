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
          With over 6 years of hands-on experience in building complex web-based user interfaces using JavaScript, CSS, and HTML, I have extensive experience with: <b>Vue.js, React.js, Next.js, Nuxt.js, Typescript, Primereact, Tailwind CSS, Daisy UI, and REST APIs.</b>
        </p>

        <p className="my-6">
          I possess a deep understanding of front-end architecture and build processes, including npm, yarn, webpack, and Monorepo setups with Micro-Frontend Architecture, NX, and Turborepo.
        </p>

        <p>
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
            <div>
              For more details, here's my
              <a
                className="text-yellow ml-1"
                target="_blank"
                href="https://docs.google.com/document/d/1LOO_sdXimhxD43TeWSkoZbqASsT3B68l9YAdkyxmwNU/edit?usp=share_link"
              >
                Resume ✓
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="resume container mx-auto p-8 bg-tertiary">
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
        <h5 className="text-yellow">Here are experiment projects I've demonstrated skills and use knowledge in Real-world projects...</h5>
        <div className="mt-6 grid grid-cols-3 gap-6">
          { projects.map((project, index) => (
            <a
              key={index}
              href={project.link}
              target="_blank"
              className="col-span-3 grid grid-cols-3 gap-6 mb-6 block hover:opacity-70"
            >
              <div className="col-span-1 justify-self-end">
                <img className="h-48" src={project.thumb} />
              </div>

              <div className="col-span-2">
                <h6 className="text-slate my-2 text-2xl">
                  <span className="inline-block">
                    {project.title}
                  </span>

                  <span className="inline-block align-middle ml-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </span>
                </h6>
                <p className="text-xs">
                  {parse(project.desc)}
                </p>
              </div>
            </a>
          )) }
        </div>
      </div>
    </Layout>
  );
}

export default App;
