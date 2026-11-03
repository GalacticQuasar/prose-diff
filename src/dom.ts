export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
