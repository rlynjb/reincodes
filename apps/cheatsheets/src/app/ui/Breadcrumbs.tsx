import {
  FC,
  createContext,
  useMemo,
  useState,
  ReactNode
} from "react";


interface itemsProps {
  label: string
  link?: string
}

interface BreadcrumbsProps {
  children?: ReactNode
  items?: itemsProps[]
  setPathFromRouter?: boolean
}

interface BreadcrumbsContextProps {
  pathItems: itemsProps[]
  setPathItems: (items: itemsProps[]) => void
}


export const BreadcrumbsContext = createContext<BreadcrumbsContextProps>({
  pathItems: [],
  setPathItems: (items: itemsProps[]) => {}
})

export const Breadcrumbs: FC<BreadcrumbsProps> = ({children, items, setPathFromRouter = false}) => {
  let initialItems = items || [
    { label: 'Home', link: '/' },
    { label: 'Documents', link: '/documents' },
    { label: 'Add Document', link: '/documents/add' }
  ]
  //if useBreadcrumb is used, use context
  const [pathItems, setPathItems] = useState(initialItems)
  const context = useMemo(() => {
    return {
      pathItems,
      setPathItems
    }
  }, [pathItems])


  if (pathItems.length) {
    initialItems = pathItems
  }

  return (
    <>
      <div className="text-sm breadcrumbs">
        <ul>
          {initialItems.map((item: any, index: number) => (
            <li key={index}>
              <a href={item.link}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <BreadcrumbsContext.Provider value={context}>
        {children}
      </BreadcrumbsContext.Provider>
    </>
  )
}

export default Breadcrumbs;
