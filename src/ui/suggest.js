// Draws the address bar suggestions the window UI (renderer.js) computed; reports hover and picks back.
const $ = (id) => document.getElementById(id);

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
};

const looksLikeUrl = (text) =>
  /^[a-z][a-z0-9+.-]*:/i.test(text) || /^localhost(:\d+)?(\/|$)/.test(text) || (!/\s/.test(text) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text));

// Text with the fuzzy-matched characters in bold.
function highlighted(text, positions) {
  const marks = new Set(positions);
  const out = [];
  for (let i = 0; i < text.length; ) {
    const bold = marks.has(i);
    let j = i;
    while (j < text.length && marks.has(j) === bold) j++;
    out.push(bold ? el('b', { textContent: text.slice(i, j) }) : document.createTextNode(text.slice(i, j)));
    i = j;
  }
  return out;
}

let lastMouse = { x: null, y: null };

function select(index) {
  [...$('suggestions').children].forEach((item, j) => item.classList.toggle('selected', j === index));
}

function render({ rows, selected }) {
  $('suggestions').replaceChildren(
    ...rows.map((row, i) => {
      let icon, main, detail;
      if (row.kind === 'typed') {
        const url = looksLikeUrl(row.query);
        icon = el('span', { className: 'sg-icon', textContent: url ? '↗' : '⌕' });
        main = [el('span', { className: 'sg-title', textContent: row.query })];
        detail = url ? 'open' : 'search Google';
      } else {
        const blank = () => el('span', { className: 'sg-icon favicon-blank' });
        icon = row.favicon ? el('img', { className: 'sg-icon', src: row.favicon, onerror: (e) => e.target.replaceWith(blank()) }) : blank();
        main = [
          el('span', { className: 'sg-title' }, highlighted(row.title || row.displayUrl, row.title ? row.highlight.title : row.highlight.url)),
          ...(row.title ? [el('span', { className: 'sg-url' }, highlighted(row.displayUrl, row.highlight.url))] : []),
        ];
        detail = row.kind === 'tab' ? 'switch to tab' : '';
      }
      const item = el('li', { className: `sg${i === selected ? ' selected' : ''}` }, [icon, ...main, el('span', { className: 'sg-detail', textContent: detail })]);
      // Only move the highlight on hover (rebuilding the list would swap the row out from under the
      // mouse), and only when the mouse really moved: a list opening under a resting pointer
      // shouldn't change what Enter picks.
      item.onmousemove = (e) => {
        const first = lastMouse.x === null; // just where the pointer was when the list appeared
        if (e.screenX === lastMouse.x && e.screenY === lastMouse.y) return;
        lastMouse = { x: e.screenX, y: e.screenY };
        if (first || item.classList.contains('selected')) return;
        select(i);
        window.suggestions.hover(i);
      };
      // Pick on press: pressing here moves focus out of the address bar, which closes the list.
      item.onmousedown = (e) => {
        e.preventDefault();
        window.suggestions.pick(i);
      };
      return item;
    }),
  );
}

window.suggestions.onRows(render);
window.suggestions.onSelect(select);
