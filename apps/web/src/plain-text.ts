// The text of an element as written, without the furigana over it (the <rt> readings), for the tests and checks
// that compare a screen's words with the lines they came from.
export function plainText(el: Element | null): string {
  if (el === null) return "";
  const c = el.cloneNode(true) as Element;
  for (const rt of c.querySelectorAll("rt")) rt.remove();
  return c.textContent ?? "";
}
