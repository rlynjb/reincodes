export const C12_SERVER_SIDE_RENDERING = [
  {
    problem: "What are reasons for implementing SSR?",
    title: "Reasons for implementing SSR",
    desc: `
    - Implementing SEO <br>
    - A common code base <br>
    - Better performance
    `,
    sample: ``
  },
  {
    problem: "What are drawbacks for implementing SSR?",
    title: "Don't underestimate the complexity of SSR",
    desc: `
    - SSR can incur additional costs, extending development time and adding complexity. It also increases server load, potentially necessitating costlier infrastructure. <br>
    - Testing may become more time-consuming due to the heightened complexity. <br>
    - A recommendentation is to initially focus on constructing the client-side version of your web application. Once it is fully functional and performs well on the server, you can then consider incorporating SSR to enhance the user experience.
    `,
    sample: ``
  },
  {
    problem: "How do we determine what goes in Server Components and Client Components?",
    title: "Composition Patterns",
    desc: `https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns`,
    sample: ``
  },
  {
    problem: "Can we use custom React Hooks in Server Components?",
    title: "Understand how Context API's limitations in Server Components",
    desc: `We can but we need to define 'use client' in its parent component. A work around is to convert custom hook to a component instead and define 'use client' in the component file itself.
    <br>
    ref: https://medium.com/@sjoerd3000/using-react-context-in-combination-with-server-components-afe6b5c8923c <br>
    ref: https://souporserious.com/managing-react-context-in-server-components/
    `,
    sample: ``
  },
  {
    problem: "What is the equivalent of Context API in SSR?",
    title: "React Cache or InversifyJS",
    desc: `
    good reads: <br>
    - https://github.com/vercel/next.js/discussions/42301 <br>
    - https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#sharing-data-between-components <br>
    - https://www.reddit.com/r/nextjs/comments/18frfs7/how_do_you_manage_dependency_injection_in_nextjs/
    `,
    sample: ``
  }
];

export default C12_SERVER_SIDE_RENDERING;
