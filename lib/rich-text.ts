// Formatted text is shared between collaborators and rendered as HTML, so every value
// passes through this allowlist before it reaches the DOM or the database.
const allowedTags = new Set(['B','STRONG','I','EM','U','S','STRIKE','SPAN','FONT','BR','DIV','P','UL','OL','LI']);
const droppedTags = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','TEMPLATE','NOSCRIPT','SVG','MATH','TITLE','HEAD','META','LINK']);
const colorValue = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i;

export function escapeHtml(text: string): string {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function plainToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g,'<br>');
}
function clean(parent: Element) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType===Node.TEXT_NODE) continue;
    if (node.nodeType!==Node.ELEMENT_NODE) {node.remove();continue;}
    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase(); // SVG/MathML tag names keep their lowercase spelling.
    if (droppedTags.has(tag)) {element.remove();continue;}
    clean(element);
    if (!allowedTags.has(tag)) {element.replaceWith(...element.childNodes);continue;}
    const color = element.style.color, background = element.style.backgroundColor, align = element.style.textAlign;
    const fontColor = tag==='FONT' ? element.getAttribute('color') : null;
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (color && colorValue.test(color)) element.style.color=color;
    if (background && colorValue.test(background)) element.style.backgroundColor=background;
    if (['left','center','right','justify'].includes(align)) element.style.textAlign=align;
    if (fontColor && colorValue.test(fontColor)) element.setAttribute('color',fontColor);
  }
}
/** Returns HTML that contains only formatting tags, colors, highlights, and alignment. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser==='undefined' || !html) return '';
  // DOMParser documents are inert: scripts don't run and resources don't load while we inspect them.
  const root = new DOMParser().parseFromString(`<body><div>${html}</div></body>`,'text/html').body.firstElementChild;
  if (!root) return '';
  clean(root);
  return root.innerHTML;
}
