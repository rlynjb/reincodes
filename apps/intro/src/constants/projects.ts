export const projects = [
  {
    title: 'reinotes - Note Taking App',
    desc: `
    Note taking app I built and use to jot down notes/highlights when reading books about tech.<br>
    Build with React, TailwindCSS, and DaisyUI deployed on Netlify under Monorepo architecture.<br>
    <br>
    - Implemented knowledge in basic Functional Programming (React's core foundation). <br>
    - Built a simple i18n plugin using Context API and custom hooks. <br>
    - Built a simple Menu UI component, separating business logic from UI and emitting data from child to parent components.<br>
    - Built a Breadcrumb UI component using Context API, custom hooks/components. <br>
    - Implemented a simple test using Jest to check of page loads. <br>
    - Implemented React Quill editor for rich text editing. <br>
    `,
    link: 'https://reinotes.netlify.app/',
    thumb: '../assets/reinotes.png'
  },
  {
    title: 'Portfolio Microfrontend',
    desc: `
    My portfolio site built with: Microfrontend architecture, NX, React, TailwindCSS, Netlify. <br>
    <br>
    - Implemented knowledge in Microfrontend Architecture, NX, React, and deploying Monorepo in Netlify.
    `,
    link: 'https://reincodes.netlify.app/',
    thumb: '../assets/portfolio.png'
  },
  {
    title: 'UI Design System',
    desc: `
    A simple UI Design System I experimented with and used gained knowledge in real-world projects. <br>
    Built with: Vue3, TailwindCSS, DaisyUI. <br>
    <br>
    - Implemented knowledge in Vue3 using Composition API <br>
    - Implemented knowledge in DSA separating UI logic from Business logic.
    `,
    link: 'https://rlynjb.github.io/uidesign/',
    thumb: '../assets/ui_system_design.png'
  },
  {
    title: 'SpaceX Seat Reservation',
    desc: `
    An experimental project to learn concepts of GraphQL. <br>
    React, Apollo GraphQL, Netlify Functions, MongoDB`,
    link: 'https://spacex-reserve-seat.netlify.app/',
    thumb: '../assets/spacex.png'
  },
  {
    title: 'Persopo - Public Record Search',
    desc: `
    A legacy project I worked on with a small team of developers using Ember.js, Golang`,
    link: 'https://persopo.com/',
    thumb: '../assets/persopo.png'
  }
]

export default projects;
