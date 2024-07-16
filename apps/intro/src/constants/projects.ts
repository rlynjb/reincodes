export const projects = [
  {
    title: 'Note taking / Study Aid app (Reinotes)',
    desc: `
    Note taking app I built and use to jot down notes/highlights when reading books about tech.<br>
    Built with React, TailwindCSS, and DaisyUI deployed on Netlify.<br>
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
    title: 'Portfolio built in Microfrontend (Reincodes)',
    desc: `
    An expriemental project and my portfolio site built with: Microfrontend architecture, NX, React, TailwindCSS and use knowledge in real-world projects. <br>
    Deplyed on Netlify under NX config. <br>
    `,
    link: 'https://reincodes.netlify.app/',
    thumb: '../assets/portfolio.png'
  },
  {
    title: 'UI Design System',
    desc: `
    A simple UI Design System I experimented with and used knowledge in real-world projects. <br>
    Built with: Vue3, TailwindCSS, DaisyUI, Styleguidist. <br>
    Deployed in Github Pages. <br>
    <br>
    - Built with Vue3 using Composition API <br>
    - Separating UI logic from Business logic. <br>
    - Built Table component using 2D array matrix data structure. <br>
    `,
    link: 'https://rlynjb.github.io/uids/',
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
    My first JavaScript project I worked on with a small team of developers using Ember.js, Golang`,
    link: 'https://persopo.com/',
    thumb: '../assets/persopo.png'
  }
]

export default projects;
