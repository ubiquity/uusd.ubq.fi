export function truncateString(text: string) {
  return text.slice(0, 5) + "..." + text.slice(-5);
}
