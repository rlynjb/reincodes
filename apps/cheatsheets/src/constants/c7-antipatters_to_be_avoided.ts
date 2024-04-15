export const C7_ANTIPATTERNS_TO_BE_AVOIDED = [
  {
    title: "Initializing the state using properties",
    desc: "It's best pracitce to make it explicit and give the property a name that makes you intentions clear, such as initialCount.",
    sample: `
    type Props = {
      initialCount: number
    }

    const Counter: FC<Props> = ({ initialCount }) => {
      const [count, setCount] = useState(initialCount)
    }

    // Usage:
    <Counter initialCount={1} />
    `
  },
  {
    title: "Using indexes as a key",
    desc: "The key must be unique and stable, identifying one, and only one, item.",
    sample: `
    {
      items.map((item, index) => (
        <li key={item.id}>{item}</li>
      ))
    }
    `
  },
  {
    title: "Spreading properties on DOM elements",
    desc: "We usually spread the proerties to the elements to avoid writing every single one mannually",
    sample: `
    <Component {...props} />

    // when we spread properties into a DOM element, we run
    // the risk of adding unknown HTML attributes

    // One solution we can use to solve this problem is to create a
    // property called domProps that we can spread safely to the
    // compoenent because we are explicitly saying that it contains
    // valid DOM properties

    const Spread = props => <div {...props.domProps} />

    // Usage:
    <Spead foo="bar" domProps={{ id: 'foo', className: 'bar' }} />
    `
  }
]

export default C7_ANTIPATTERNS_TO_BE_AVOIDED
