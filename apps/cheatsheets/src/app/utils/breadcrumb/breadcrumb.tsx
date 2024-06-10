"use client";

import {
  createContext,
  FC,
  ReactNode
} from 'react';


interface BreadcrumbContextProps {
  items: any[],
  setItems: any
}

interface BreadcrumbProviderProps {
  children?: ReactNode,
  items?: any[],
  setItems?: any
}


export const BreadcrumbContext = createContext<BreadcrumbContextProps>({
  items: [],
  setItems: () => {}
});


export const BreadcrumbProvider: FC<BreadcrumbProviderProps> = ({ children, items }) => {
  console.log(items)
  const context = {
    items: [],
    setItems: () => {}
  }

  return (
    <BreadcrumbContext.Provider value={context}>
      { children }
    </BreadcrumbContext.Provider>
  )
}
