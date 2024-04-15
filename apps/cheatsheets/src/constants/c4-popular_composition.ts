export const C4_POPULAR_COMPOSITION = [
  {
    title: 'Communicating components',
    desc: 'Small components with a clean interface can be composed together to create complex applications that are powerful and maintainable at the same time. This way, we can produce new parts of the user interface very quickly, writing only a few lines of code.',
    sample: `
    const Profile = () => {
      return (
        <div>
          <Avatar avatarImageUrl={user.profileImageUrl} />
          <Username name={user.name} screenName={user.screenName} />
        </div>
      );
    }
    `
  },
  {
    title: 'Exploring the Container and Presentational Patterns',
    desc: 'React components typically contain a mix of logic and presentation. By logic, we refer to anything that is unrelated to the UI, such as API calls, data manipulation, and event handlers. The presentation is the part of the render where we create the elements to be displayed on the UI.',
    sample: `
    Functional components are an incredibly elegant way to define UIs.
    They are pure functions that, given a state, return the elements of it.

    The ff. are the characteristics of conttainer components:
    - They are more concerned with behavior.
    - They render their presentational components.
    - They make API calls and manipulate data.
    - They define event handlers.

    The ff. are the characteristics of presentational components:
    - They are more concerned with the visual representation.
    - They render the HTML markup (or other components).
    - They receive data from the parents in the form of props.
    - They are often written as stateless functional components.
    `
  },
  {
    title: 'Understanding HOCs',
    desc: "HOCs are functions that take a component as input and return an enhanced component as output. By using HOCs, we avoid polluting any state and don't require the component to implement any function. This means the component and HOC are not coupled, and both can be resued throughout the application. Some common HOCs are connect from Redux and createFragmentContianer from Relay.",
    sample: `
    // Ex. you need to attach the same className property
    // to every components. You could manually add the
    // className property to each render method, or
    // you could write an HOC like this:

    const withClassName = Component => props => {
      return (
        <Component {...props} className="my-class" />
      )
    }

    // It's common to use the with prefix for HOCs.

    // Usage:
    const MyComponentWithClassName = withClassName(MyComponent)
    `
  },
  {
    title: "Understanding FunctionAsChild",
    desc: "the FunctionAsChild is a component with a children property defined as a function. Instead of being used as a JSX expression, it gets called.",
    sample: `
    const FunctionAsChild = ({ children }) => children()

    // Usage:
    <FunctionAsChild>
      {() => <div>Hello World</div>}
    </FunctionAsChild>

    // The primary advantage is the ability to encapsulate components,
    // delivering variables dynamically, as opposed to
    // utilizing static properties, which is a common practice with HOCs.
    // A goood example is a Fetch component, designed to retrieve data
    // from a specific API endpoint and sunsequently return it to its child function

    // Usage:
    <Fetch url="https://api.example.com">
      { data => <List data={data} /> }
    </Fetch>
    `
  }
];

export default C4_POPULAR_COMPOSITION;
