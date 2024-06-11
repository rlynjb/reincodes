import { useContext, useEffect } from 'react';
import { BreadcrumbsContext } from './Breadcrumbs';

export const useBreadcrumbs = (pathItems?: any[]) => {
  const context = useContext(BreadcrumbsContext);

  useEffect(() => {
    context.setPathItems(pathItems || [])
    return () => context.setPathItems([]);
  }, [pathItems, context]);
}
