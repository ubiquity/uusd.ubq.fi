export function truncateString(text: string) {
  return text.slice(0, 5) + "..." + text.slice(-5);
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toSignificantFigures(i: any, sf: number = 3) {
  return Number(i).toLocaleString("en-US", {
    maximumFractionDigits: sf,
    useGrouping: true,
  });
}
