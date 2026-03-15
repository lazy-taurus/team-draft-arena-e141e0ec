import { useEffect, useState } from 'react';

export function useCountdown(timerEndsAt: string | null | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!timerEndsAt) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const end = new Date(timerEndsAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((end - now) / 1000));
      setSecondsLeft(diff);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [timerEndsAt]);

  return secondsLeft;
}
