export const C8_REACT_HOOKS = [
  {
    title: "State Hook",
    desc: "",
    sample: `
    import { useState } from 'react'

    const Counter = () => {
      const [count, setCount] = useState<number>(0)
    }
    `
  },
  {
    title: "Rules of Hooks",
    desc: "",
    sample: `
    Rule 1: Only Call Hooks at the Top Level
    - It's important to avoid calling them inside loops,
    conditions, or nested functions.

    Rule 2: Only Call Hooks from React Functions
    `
  },
  {
    title: "Understanding useEffect",
    desc: "We have used the lifecycle method called componentDidMount. The new React Hook, called useEffect, will now handle all the life cycle methods.",
    sample: `
    useEffect(() => {
      //
    }, [])

    // the first param is the callback of the effect
    // the second param is the dependencies array.
    // if you pass an empty array to the dependencies,
    // the state and props will have their origin initial values.

    // React provides another Hook called useLayoutEffect, which works
    // in the exact same way as useEffect.
    `
  },
  {
    title: "Understanding useCallback, useMemo, and memo",
    desc: "When we type in a texfield, we have new batches of renders. We determine that a component will not have good performance. This is where memo, useMemo, useCallback help us improve performance.",
    sample: ``
  },
  {
    title: "Memoizing a component with memo",
    desc: "The memo HOC is similar to Pure Component for a React class because it performs a shallow comparison of the props, so if we try to render a component with the same props all the time, the component will render just once and will memoize.",
    sample: `
    * Memorizes a component
    * Re-memorizes when props changes
    * Avoids re-render

    // to fix out component to avoid multiple renders when we write input

    import { FC, useEffect, memo } from 'react'
    ...
    export default memo(List)
    `
  },
  {
    title: "Memoizing a value with useMemo",
    desc: "The useMemo Hook will memoize the result (value) of a function and will have some dependencies to listen to.",
    sample: `
    * Memorizes a calculated value
    * For computed properties
    * For heavy processes

    const filteredTodoList = useMemo(() => todoList.filter((todo: Todo)) =>{
      return todo.task.toLowerCase().includes(term.toLowerCase())
    }), [])
    `
  },
  {
    title: "Memoizeing a function definition with useCallback",
    desc: "The useCallback Hook is very similar to useMemo, but the main difference is that instead of memorizing the result value of a function, as useMemo does, it is memorizing the function definition instead.",
    sample: `
    * Memorizes a function definition to avoid redefining it on each render
    * use it whenever a function is passed as an effect argument
    * use it whenever a function is passed by pros to a memorized component

    const handleDelete = useCallback((taskId: number) => {
      const newTodoList = todoList.filter((todo: Todo) => todo.id !== taskId)
      setTodoList(newTodoList)
    }, [todoList])
    `
  },
  {
    title: "useReducer Hook",
    desc: "useReducer concepts are basically similar to Redux (react-redux): actions, reducers, disptach, store, and state. Although, useReducer does not have a store by default, instead you can create one using useContext, but this is just reinventing the wheel.",
    sample: `
    // App.tsx
    import Notes from './Notes'
    function App() {
      return (
        <Notes />
      )
    }
    export default App

    // Notes.tsx
    import { useReducer, useState, ChangeEvent } from 'react'

    // define TS types
    type Note = {
      id: number
      note: string
    }
    type Action = {
      type: string
      payload?: any
    }
    type ActionTypes = {
      ADD: 'ADD'
      UPDATE: 'UPDATE'
      DELETE: 'DELETE'
    }
    const actionTypes: ActionTypes = {
      ADD: 'ADD',
      UPDATE: 'UPDATE',
      DELETE: 'DELETE'
    }

    //create initialNote
    const initialNotes: Note[] = {
      {
        id: 1,
        note: 'First note'
      },
      {
        id: 2,
        note: 'Second note'
      }
    }

    // create reducer to perform basic operations
    const reducer = (state: Note[], action: Action) => {
      switch(action.type) {
        case actionTypes.ADD:
          return [...state, action.payload]
        case actionTypes.UPDATE:
          const updatedNote = action.payload
          return state.map((note: Note) => {
            return note.id === updatedNote.id ? updatedNote : note
          })
        case actionTypes.DELETE:
          return state.filter((note: Note) => note.id !== action.payload.id)
        default:
          return state
      }
    }

    // create Notes component
    const Notes = () => {
      const [notes, dispatch] = useReducer(reducer, initialNotes)
      const [note, setNote] = useState<string>('')
      ...

      const handleSubmit = (e: ChangeEvent<HTMLInputElement>) => {
        e.preventDefault()
        // add Note etc
      }

      return (
        <div>
          form stuff template
        </div>
      )
    }
    `
  }
]

export default C8_REACT_HOOKS
