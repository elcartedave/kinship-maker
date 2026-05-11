export function createDebouncedAction<T>(
  action: (value: T) => void,
  delay: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    trigger(value: T) {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = null;
        action(value);
      }, delay);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    flush(value: T) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      action(value);
    },
  };
}
