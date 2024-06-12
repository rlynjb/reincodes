/**
 * Context API implement of BreadCrumbs
 * https://www.gcasc.io/blog/next-dynamic-breadcrumbs
 */

import {
  FC,
  createContext,
  useMemo,
  useState,
  ReactNode,
  useContext,
} from "react";


interface itemsProps {
  label: string
  link?: string
}

interface BreadcrumbsProps {
  items?: itemsProps[]
}

interface BreadcrumbsContextProps {
  pathItems: itemsProps[]
  setPathItems: (items: itemsProps[]) => void
}

interface BreadcrumbsProviderProps {
  children?: ReactNode
}


export const BreadcrumbsContext = createContext<BreadcrumbsContextProps>({
  pathItems: [],
  setPathItems: (items: itemsProps[]) => {}
})

export const BreadcrumbsProvider: FC<BreadcrumbsProviderProps> = ({ children }) => {
  const [ pathItems, setPathItems] = useState<any[]>([])

  const context = {
    pathItems,
    setPathItems,
  }

  return (
    <BreadcrumbsContext.Provider value={context}>
      {children}
    </BreadcrumbsContext.Provider>
  )
}

export const Breadcrumbs: FC<BreadcrumbsProps> = ({items}) => {
  let initialItems = items || [
    { label: 'Home', link: '/' },
    { label: 'Documents', link: '/documents' },
    { label: 'Add Document', link: '/documents/add' }
  ]
  //if useBreadcrumb is used, use context
  const context = useContext(BreadcrumbsContext)

  if (context.pathItems.length) {
    initialItems = context.pathItems
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
    </>
  )
}

export default Breadcrumbs;
