import { useContext, useEffect, useRef } from 'react';
import { BreadcrumbsContext } from './Breadcrumbs';

export const useBreadcrumbs = (pathItems?: any[]) => {
  const context = useContext(BreadcrumbsContext);

  /**
   * Fix for useEffect infinite loops issue
   * https://blog.logrocket.com/solve-react-useeffect-hook-infinite-loop-patterns/
   */
  const { current: myArray } = useRef(pathItems);

  useEffect(() => {
    context.setPathItems(myArray || [])

    return () => context.setPathItems([]);
  }, [myArray, context]);
}
