import { useState } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/**
 * A key that changes when the person navigates (back/forward, a link) but not when the page
 * rewrites its own URL with `replace`. Putting it on a form whose fields mirror the URL makes
 * the fields start over from the new URL after a real navigation, while typing (which keeps
 * replacing the URL) never remounts them mid-keystroke.
 */
export function useExternalNavigationKey(): string {
  const { key } = useLocation();
  const type = useNavigationType();
  const [state, setState] = useState({ seen: key, current: key });

  // Derived during render, the documented alternative to an effect that sets state.
  if (state.seen !== key) {
    setState({ seen: key, current: type === NavigationType.Replace ? state.current : key });
  }
  return state.current;
}
