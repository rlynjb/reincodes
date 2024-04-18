export const C5_WRITING_CODE_FOR_THE_BROWSER = [
  {
    title: "Uncontrolled Components",
    desc: "Uncontrolled components are like regular HTML form inputs for which you will not be able to manage the value yourself but instead, the DOM will take care of handling the value and you can get this value by using a React ref.",
    sample: `
    An example of an uncontrolled component,
    where we do not set the value of the input field,
    but we let the component manage its own internal state.

    import { FC, useState, ChangeEvent, MouseEvent } from 'react'

    const Uncontrolled: FC = () => {
      const [value, setValue] = useState<string>('')

      return (
        <form>
          <input type="text" />
          <button>Submit</button>
        </form>
      )
    }
    `
  },
  {
    title: "Controlled components",
    desc: "A controlled component is a React component that controls the values of input elements in a form by using the component state.",
    sample: `
    import { useState } from 'react'

    const Controlled = () => {
      return (
        <form>
          <input type="text" defaultValue="Hello" />
          <button>Submit</button>
        </form>
      )
    }

    // When the state changes, React re-renders the component
    // and uses it again to relfect the current values of the input fields.
    // We now have full control over the values of input fields.
    `
  },
  {
    problem: "how to define events in JSX and how to pass down events to child components",
    title: "Handling events",
    desc: "",
    sample: `
    return (
      // to define event
      <button onClick={handleClick}>Click me</button>

      // to pass down event to child
      <ChildComponent onClick={handleClick} />

      // ChildComponent.tsx
      import { ReactNode, FC } from "react";

      interface Props {
        children?: ReactNode,
        onClick?: () => void,
      }

      export const Button: FC<Props> = ({children, onClick}) => {
        return (
          <button
            className="btn rounded-none w-full"
            onClick={onClick}
          >
            {children}
          </button>
        )
      }

      export default Button;
    )
    `
  },
  {
    title: "Exploring refs",
    desc: "React is declarative, but there are some cases where you need to access underlying DOM nodes to perform some imperative operations. This should be avoided.",
    sample: `
    import { useRef } from 'react'

    const Focus = () => {
      const inputRef = useRef(null)

      const handleClick = () => {
        inputRef.current.focus()
      }

      return (
        <>
          <input
            type="text"
            ref={inputRef}
          />
          <button onClick={handleClick}>Focus</button>
        </>
      )
    }
    export default Focus
    `
  },
  {
    problem: "how do we access a child component's DOM element (ref) from the parent component",
    title: "Understanding forwardRef",
    desc: "react.forwardRef is a HOC that allows you to pass a ref down to a child component. This is useful when you need to access the child component's DOM elements of instance from the parent component.",
    sample: `
    import React from 'react'

    const TextInputWithRef = React.forwardRef((props, ref)) => {
      return (
        <input
          type="text"
          ref={ref}
          {...props}
        />
      )
    }
    export default TextInputWithRef

    // Usage:
    import React, { useRef } from 'react'
    import TextInputWithRef from './TextInputWithRef'

    function App() {
      const inptRef = useRef()
      const handleClick = () => {
        inputRef.current.focus()
      }

      return (
        <div>
          <TextInputWithRef ref={inputRef} />
          <button onClick={handleClick}>Focus on input</button>
        </div>
      )
    }
    `
  },
  {
    title: "Implementing animations",
    desc: "React comes with an add-on called react-transition-group, which is a component that helps us build animations in a declarative way.",
    sample: `
    npm install --save react-transition-group @types/react-transition-group

    // Once we have done that, we can import
    import { TransitionGroup } from 'react-transition-group'

    // then we just wrap component to which we want to apply the animation
    const Transition = () => {
      return (
        <TransitionGroup
          transitionName="fade"
          transitionAppear
          transitionAppearTimeout={500}
        >
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </TransitionGroup>
      )
    }
    `
  },
  {
    problem: "what is the proper way to create icon components",
    title: "Exploring SVG",
    desc: "A common way to create SVG in a web app with React is to wrap our vectors into a React component and use that props to define their dynamic values.",
    sample: `
    const Circle = ({x, y, radius, fill}) => {
      return (
        <svg>
          <circle cx={x} cy={y} r={radius} fill={fill} />
        </svg>
      )
    }
    `
  }
]

export default C5_WRITING_CODE_FOR_THE_BROWSER
