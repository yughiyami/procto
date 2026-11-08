import { useEffect } from 'react';

const SUFFIX = ' · Izumi';

/** Sets document.title for the current page, restoring the previous title on unmount. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title}${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
