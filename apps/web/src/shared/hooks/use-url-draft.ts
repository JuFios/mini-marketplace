import { useEffect, useEffectEvent, useState } from 'react';
import { useDebouncedValue } from './use-debounced-value';

/**
 * A text field that keeps its own draft and writes it to the URL only after typing pauses. The
 * draft starts from the URL; `commit` is called with the trimmed text, and only when it differs
 * from what the URL already says (so a change made elsewhere, like "Reset", is not undone by a
 * stale draft). Pair it with `useExternalNavigationKey` to refill the draft after back/forward.
 */
export function useUrlDraft(urlValue: string, commit: (value: string) => void, delayMs = 300) {
  const [draft, setDraft] = useState(urlValue);
  const debounced = useDebouncedValue(draft.trim(), delayMs);

  // An effect event reads the current URL value without making the effect re-run when it changes.
  const apply = useEffectEvent((value: string) => {
    if (value !== urlValue) commit(value);
  });
  useEffect(() => apply(debounced), [debounced]);

  return [draft, setDraft] as const;
}
