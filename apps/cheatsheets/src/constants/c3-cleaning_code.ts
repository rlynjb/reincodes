export const C3_CLEANING_CODE = [
  {
    title: 'React.Fragment',
    desc: 'New feature that works as a special wrapper for elements. It can be specified as React.Fragment or as an empty tag(<></>).',
    sample: `
      return (
        <>
          <ChildA />
          <ChildB />
        </>
      )
    `
  },
  {
    title: 'Spaces',
    desc: 'JSX handles the spaces between text and elements differently from HTML.',
    sample: `
    <div>
      <span>My</span>
      {' '}
      name is
      {' '}
      <span>Rein</span>
    </div>`
  },
  {
    title: 'Boolean attributes',
    desc: 'If you set an attribute without a value, JSX assumes that its value is true, ff. the same behavior as the HTML diabled attribute.',
    sample: ``
  },
  {
    title: 'Spread attributes',
    desc: 'A common practice that leads to fewer bugs is not to pass entire JS objects down to children by reference, but to use primitive values, which can be easily validated, making components more robust and error-proof.',
    sample: `
    const attrs = { name: 'Rein', age: 25 }

    return <div {...attrs} />
    `
  },
  {
    title: 'Multiline',
    desc: 'whenever we have nested elements, we should always go multiline.',
    sample: `
    <div>
      <Header />
      <div>
        <Main content={...} />
      </div>
    </div>
    `
  },
  {
    title: 'Multi-properties',
    desc: 'A common solution is to write each attribute on a new line, with one level of indentation, and then align the closing bracket with the opening tag.',
    sample: `
    <button
      foo="bar"
      veryLongPropertyName="baz"
      onSomething={this.handleSomething}
    />
    `
  },
  {
    title: 'Conditionals #1 - Classic if...else statement',
    desc: 'Classic if...else statement',
    sample: `
    let button

    if (isLoggedIn) {
      button = <LogoutButton />
    } else {
      button = <LoginButton />
    }

    return <div>{button}</div>
    `
  },
  {
    title: 'Conditionals #2 - Inline condition',
    desc: 'Inline condition',
    sample: `
    return <div>
      {isLoggedIn && <LoginButton />}
    </div>
    `
  },
  {
    title: 'Conditionals #3 - Ternary condition',
    desc: 'It is used in popular repositories, such as Redux real-world examples where ternary is used to show a Loading label if the component is fetching the data or Load More inside a button depending on the value of the isFetching variable.',
    sample: `
    return <div>
      {isLoggedIn ? <LogoutButton /> : <LoginButton />}
    </div>
    `
  },
  {
    title: 'Conditionals #4 - Helper function',
    desc: 'We can create a helper function inside our component and use it in JSX to verify the condition. This is a good practice to keep the JSX clean and easy to read.',
    sample: `
    // using inline condition is a good solution, but readability is strongly impacted.
    <div>
      {dataIsReady && (isAdmin || userHasPermissions) && <SecretData />}
    </div>

    // Help function to the rescue!!
    const MyComponent = ({ dataIsReady, isAdmin, userHasPermissions }) => {
      const canShowSecretData = () => {
        return dataIsReady && (isAdmin || userHasPermissions)
      }

      return (
        <div>
          {canShowSecretData() && <SecretData />}
        </div>
      )
    }
    `
  },
  {
    title: 'Conditionals #5 - Helper Function for computed properties',
    desc: 'This is better because it is isolated and can be tested independently.',
    sample: `
    const MyComponent = ({ currency, value }) => {
      const getPrice = () => {
        return currency + value
      }

      return <div>{getPrice()}</div>
    }
    `
  },
  {
    title: 'Conditionals #6 - RenderIf component',
    desc: 'We can create a custom component and call it RenderIf to render our compoenents conditionally.',
    sample: `
      // RenderIf.tsx
      import React, { FC, ReactElement } from "react";

      interface Props {
        children: ReactElement | string
        isTrue?: Boolean
        isFalse?: Boolean
      }

      const RenderIf: FC<Props> = ({ children, isTrue, isFalse }) => {
        if (isTrue === true) {
          return <>{children}</>
        }
        if (isFalse === false) {
          return <>{children}</>
        }
        return null
      }

      export default RenderIf


      // ComponentProject.tsx
      import RenderIf from './RenderIf'

      const MyComponent = ({ dataIsReady, isAdmin, userHasPermissions }) => {
        return (
          <RenderIf isTrue={dataIsReady && (isAdmin || userHasPermissions)}>
            <SecretData />
          </RenderIf>
        )
      }
    `
  },
  {
    title: 'Loops',
    desc: 'The most common way to generate an array of elements, given an array of objects, is to use map.',
    sample: `
    <ul>
      {users.map(user => <li>{user.name}</li>)}
    </ul>
    `
  },
  {
    title: 'Sub-rendering (Sub-render method)',
    desc: 'We always want to keep our components very small and our render methods very clean and simple. One solution is to split it into smaller functions in a way that lets up keep all the logic in the same component. In Redix real-world exampls, a sub-render method is used to render the load more button.',
    sample: `
    const renderUserMenu = () => {
      // JSX for user menu
    }

    const renderAdminMenu = () => {
      // JSX for admin menu
    }

    return (
      <div>
        <h1>Welcome back!</h1>
        {userExists && renderUserMenu()}
        {userIsAdmin && renderAdminMenu()}
      </div>
    )
    `
  },
  {
    title: 'Functional Programming',
    desc: 'Besides following best practices and using linter to catch errors and enforce consistency, another way to clean up our code is to adopt an FP style. We can write more declarative and less imperative code, maing our components easier to read and reason about.',
    sample: `
    FP principles:
    - Immutability
    - Pure functions
    - Higher-order functions
    - and more...
    `
  },
  {
    title: 'First-class functions (HOF or HOC)',
    desc: 'JavaScript has first-class functions because they are treated like any other variable, meaning you can pass a function as a parameter to other functions, or it can be returned by another function and be assigned as a value to a variable.',
    sample: `
    // Higher-Order Functions are functions that take a function as a parameter,
    // and optionally some other params, and return a function.
    // The returned function is usually enhanced with some special behaviors.

    const add = (x, y) => x + y
    const log = fn => (...args) => {
      return fn(...args)
    }
    const logAdd = log(add)
    `
  },
  {
    title: 'Purity',
    desc: 'A function is pure when there are no side effects, which means that the function does not change anything that is not local to the function itself. Meanwhile, A function that changes the state of an application/modifies variables defined in the upperscope, or a function that touches external entities (DOM) is considered impure. Impure functions are harder to debug, and mose of the time it is not possible to apply them multiple times and expect to get the same result.',
    sample: `
    // Pure function
    const add = (x, y) => x + y

    // Impure function
    let x = 0
    const add = y => (x = x + y)
    `
  },
  {
    title: 'Immutability',
    desc: 'An immutable value is a value that cannot be changed.',
    sample: `
    // Doesn't follow immutability
    const add3 = arr => arr.push(3)
    const myArr = [1, 2]
    add3(myArr) // [1, 2, 3]
    add3(myArr) // [1, 2, 3, 3]

    // Follows immutability
    const add3 = arr -> arr.concat(3)
    const myArr = [1, 2]
    const result1 = add3(myArr) // [1, 2, 3]
    const result2 = add3(myArr) // [1, 2, 3]
    `
  },
  {
    title: 'Currying',
    desc: 'A common technique in FP is currying, which is the process of converting a function that takes multiple arguments into a sequence of functions that each take a single argument.',
    sample: `
    // sample, we have the ff. code:
    const add = (x, y) => x + y

    // we can instead define it as:
    const add = x => y => x + y

    // we use it in the ff. way:
    const add1 = add(1)
    add1(2) // 3
    add1(3) // 4

    // this is a pretty convenient wat of writing functions,
    // since the first value is stored after the application
    // of the first param, we can resue the second function multiple times.
    `
  },
  {
    title: 'Composition',
    desc: 'Important concept in FP to be applied in React. Functions (and components) can be combined to produce new functions with more advanced features and properties.',
    sample: `
    const add = (x, y) => x + y
    const square = x => x * x

    // these functions can be composed together to create a new function
    const addAndSquare = (x, y) => square(add(x, y))

    // we end up with small, simple, testable pure functions that can be combined
    `
  }
]

export default C3_CLEANING_CODE;
