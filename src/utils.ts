// execution of a function until after a specified delay, eslint complains about any
//eslint-disable-next-line
export function debounce(func: (...args: any[]) => void, delay: number) {
  let timer: NodeJS.Timeout;
  //eslint-disable-next-line
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}
