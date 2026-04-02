import { useEffect, useState } from 'react';

/**
 * Returns seconds left in preview phase (null if no preview active, 0 when done).
 * The bidding timer countdown should only show after preview ends.
 */
export function usePreviewCountdown(previewEndsAt: string | null | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!previewEndsAt) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const end = new Date(previewEndsAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((end - now) / 1000));
      setSecondsLeft(diff);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [previewEndsAt]);

  return secondsLeft;
}
