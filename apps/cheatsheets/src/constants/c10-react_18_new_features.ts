export const C10_REACT_18_NEW_FEATURES = [
  {
    problem: 'How can we allow React to work on multiple tasks simultaneously?',
    title: "Concurrent Mode",
    desc: `
    In traditional React, the rendering process is synchronous, which means that React updates the user interfaces in a single pass. This can sometimes lead to performance issues, especially when rendering large, complex applications or handling realtime updates.
    <br>
    <br>
    Concurrent mode allows React to split the rendering process into smaller units of work that can be executed independently and in parallel. This means React can prioritize certain tasks, such as updating the user interface, while still allowing other tasks to run in the background, such as handling user input or fetching data.
    <br>
    <br>
    <b>Key Features of Concurrent Mode:</b><br>
    - Time slicing <br>
    - Suspense <br>
    - Concurrent rendering
    `,
    sample: `
    // Usage:
    import React, { useState } from 'react'

    const Counter = () => {
      const [count, setCount] = useState<number>(0)

      const handleClick = () => {
        setCount(count + 1)
      }

      return (
        <button onClick={handleClick}>
          {count}
        </button>
      )
    }

    const App = () => {
      return (
        <React.Suspense fallback={
          <div>Loading...</div>
        }>
          <Counter />
        </React.Suspense>
      )
    }

    ReactDOM
      .createRoot(document.getElementById('root'))
      .render(<App />)
    `
  },
  {
    problem: "How can React process multiple updates in one single pass?",
    title: "Automatic Batching",
    desc: `
    In traditional React, updates to the UI are typically processed synchronously, which means Each triggers a new render pass.
    <br>
    <br>
    This can be inefficient, especially when multiple updates occur in rapid succession. Automatic batching solves this problem by grouping multiple updates together and processing them in a single render pass.
    <br>
    <br>
    This can result in significant performance improvements, especially when handling user input or realtime updates.
    `,
    sample: `
    // Usage:
    function MyComponent() {
      const [count, setCount] = useState(0)

      function handleClick() {
        setCount(count + 1)
        setCount(count + 1)
        setCount(count + 1)
      }

      return (
        <div>
          <p>Count: {count}</p>
          <button onClick={handleClick}>Increment</button>
        </div>
      )
    }
    `
  },
  {
    problem: "",
    title: "Transitions",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "Suspense on the server",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "createRoot",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "hydrateRoot",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "renderToPipeableStream",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "userId",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "useTransition",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "useDeferredValue",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "useInsertionEffect",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "Strict mode",
    desc: ``,
    sample: ``
  },
];

export default C10_REACT_18_NEW_FEATURES;
