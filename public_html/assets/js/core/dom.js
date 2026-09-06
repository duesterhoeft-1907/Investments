/**
 * Winziger DOM-Baukasten. Kein Framework, kein Build – nur eine Funktion,
 * die aus Beschreibungen Elemente macht:
 *
 *   h('div.card', { onclick: fn }, h('h2', 'Titel'), 'Text')
 *
 * Der Selektor unterstützt Tag, .klassen und #id.
 */
export function h(selector, props, ...children) {
  const [, tag = 'div', rest = ''] = /^([a-zA-Z0-9-]*)(.*)$/.exec(selector) || [];
  const el = document.createElement(tag || 'div');

  for (const part of rest.split(/(?=[.#])/)) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }

  // Zweites Argument ist optional: h('p', 'Text') funktioniert genauso.
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className += (el.className ? ' ' : '') + value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'html') el.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in el && key !== 'list' && typeof value !== 'object') {
        el[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Inhalt eines Knotens ersetzen. */
export function mount(target, ...children) {
  target.replaceChildren();
  append(target, children);
  return target;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** SVG-Element bauen – für die handgezeichneten Diagramme. */
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
  }
  for (const child of children.flat(3)) {
    if (child !== null && child !== undefined && child !== false) {
      el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  return el;
}

/** Kurzer Übergang beim Seitenwechsel. */
export function transitionIn(el) {
  el.classList.add('rise');
  el.addEventListener('animationend', () => el.classList.remove('rise'), { once: true });
  return el;
}
