// Marks the say actions rendered from the fixed sentences (src/i18n). Only those may name the "1" card
// without the gate reading it as a number; anything else, the junior's generated words included, may not.
const rendered = new WeakSet<object>();

export function markRendered<T extends object>(action: T): T {
  rendered.add(action);
  return action;
}

export function isRendered(action: object): boolean {
  return rendered.has(action);
}
