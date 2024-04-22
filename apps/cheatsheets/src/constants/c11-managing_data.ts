export const C11_MANAGING_DATA = [
  {
    problem: `what is the lightweight to share data throughout the app?
    what is the equivalent of plugin in React?
    `,
    title: "Context API",
    desc: `
    The Context API allows you to share data between components without having to pass a prop to every child component.
    <br>
    It's also super useful when you want to separate your application from you data and do all the fetching in there.
    <br>
    There are multiple uses for the Context API, which can also be used for theming or to pass functions; it all depends on your application.
    `,
    sample: `
    // Create a context
    import { FC, createContext, useState, useEffect, ReactElement, useCallback } from 'react';
    import axios from 'axios';

    // Declare interfaces
    export type Issue = {
      number: number
      title: string
      url: string
      state: string
    }
    interface Issue_Context {
      issues: Issue[]
      url: string
    }
    interface Props {
      url: string
    }

    // Now, create a context using createContext function
    // and defining the value we want ot export
    export const IssueContext = createContext<Issue_Context>({ issues: [], url: '' });

    // Create a component where we can receive props, set states,
    // perform fetch by using useEffect and render IssueContext.Provider
    const IssueProvider: FC<Props> = ({ children, url }) => {
      // State
      const [issues, setIssues] = useState<Issue[]>([]);
      const fetchIssues = useCallback(async () => {
        const response = await axios(url);
        if (response) {
          setIssues(response.data);
        }
      }, [url])

      // Effects
      useEffect(() => {
        // GOOD PRACTICE:
        // everytime we use function inside useEffect,
        // we need to wrap function in useCallback hook
        // good practice if we use async/await to have it in a
        // separate function and not directly in useEffect.
        fetchIssues();
      }, [fetchIssues]);

      // NOTE:
      // once we perform fetch and get data in issues state,
      // we add all values to export as context,
      const context = {
        issues,
        url,
      }

      // NOTE:
      // when we render IssueContext.Provider, we will pass
      // the context on value prop,
      // and finally, render children of component.
      return (
        <IssueContext.Provider value={context}>
          {children}
        </IssueContext.Provider>
      )
    }
    export default IssueProvider;
    `
  },
  {
    problem: "how do we make Context available to our components?",
    title: "Wrapping our components with the provider",
    desc: `Continuing with previous topic, this code will be added to main component of app (normally, all providers are defined in parent components)`,
    sample: `
    // Import the IssueProvider component
    // Providers
    import IssueProvider from '../contexts/Issue';
    // Components
    import Issues from './Issues';

    const App = () => {

      // NOTE:
      // we wrap Issues component with IssueProvider.
      // if we forget to wrap components with the provider,
      // we won't be able to access context within them.
      // the challenging aspect is that, we might not receive an error message;
      // instead, you will encounter undefined data.
      return (
        <IssueProvider url="https://api.github.com/repos/ContentAPI/issues">
          <Issues />
        </IssueProvider>
      )
    }
    export default App;
    `
  },
  {
    problem: "how do we consume Context using hook?",
    title: "Consuming context with useContext",
    desc: `This step will require us to wrap our main component with the provider.`,
    sample: `
    // Dependencies
    import { FC, useContext } from 'react';
    // Contexts
    import { IssueContext, Issue } from '../contexts/Issue';

    const Issues: FC = () => {
      // Here you consume your Context, and you can grab the issues value.
      const { issues, url } = useContext<Issue>(IssueContext);

      return (
        <>
          <h1>Issues</h1>
          {issues.map((issue: Issue) => (
            <p key={issue.number}>
              <a href={issue.url}>{issue.title}</a>
            </p>
          ))}
        </>
      )
    }
    export default Issues;
    `
  },
  {
    problem: "",
    title: "React Suspense with SWR",
    desc: ``,
    sample: ``
  },
  {
    problem: "",
    title: "Redux Toolkit: a modern approach to Redux",
    desc: ``,
    sample: ``
  }
];

export default C11_MANAGING_DATA;
