export function truncateString(text: string) {
  return text.slice(0, 5) + "..." + text.slice(-5);
}

export function toSignificantFigures(i: number | string | bigint, sf: number = 3) {
  return Number(i).toLocaleString("en-US", {
    maximumFractionDigits: sf,
    useGrouping: true,
  });
}
