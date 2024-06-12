import { useContext, useEffect, useRef } from 'react';
import { BreadcrumbsContext } from './Breadcrumbs';

export const useBreadcrumbs = (pathItems?: any[]) => {
  const context = useContext(BreadcrumbsContext);
  const { current: myArray } = useRef(pathItems);

  useEffect(() => {
    context.setPathItems(myArray || [])

    return () => context.setPathItems([]);
  }, [myArray, context]);
}
