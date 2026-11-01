// Draws the downloads panel from the rows the main process sends (src/services/downloads), and
// sends back what is clicked: open, show in folder, pause, resume, cancel, retry or remove.
const $ = (id) => document.getElementById(id);
const api = window.downloads;

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
};

// 16x16 line icons, drawn with the text color.
const ICONS = {
  file: 'M4 1.75h5l3.25 3.25v9.25h-8.25z M9 1.75v3.25h3.25',
  show: 'M1.75 4.25v8.5h12.5v-7h-6.5l-1.5-1.5z',
  pause: 'M5.5 3.5v9M10.5 3.5v9',
  resume: 'M5 3.25v9.5l7.5-4.75z',
  cancel: 'M4 4l8 8M12 4l-8 8',
  retry: 'M13 8a5 5 0 1 1-1.46-3.54M13 2.5v3h-3',
  remove: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.75 9.25h5.5l.75-9.25',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'dl-icon');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', ICONS[name]);
  svg.append(shape);
  return svg;
}

const LABELS = { show: 'Show in folder', pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', remove: 'Remove from list' };

function actionButton(name, id) {
  return el(
    'button',
    {
      className: `dl-btn dl-${name}`,
      title: LABELS[name],
      onclick: (e) => {
        e.stopPropagation();
        api.action(name, id);
      },
    },
    [icon(name)],
  );
}

// Which buttons a row gets for where its download is.
function actionsFor(row) {
  if (row.state === 'progressing') return [row.paused ? 'resume' : 'pause', 'cancel'];
  if (row.state === 'completed' && !row.removed) return ['show', 'remove'];
  return ['retry', 'remove'];
}

// "report.pdf" -> "PDF", shown on the file icon.
const extension = (filename) => (/\.([a-z0-9]{1,4})$/i.exec(filename)?.[1] || '').toUpperCase();

function progressBar(row) {
  const bar = el('span', { className: 'dl-bar-fill' });
  if (row.progress === null) bar.classList.add('indeterminate');
  else bar.style.width = `${Math.round(row.progress * 100)}%`;
  return el('span', { className: `dl-bar${row.paused ? ' paused' : ''}` }, [bar]);
}

function rowItem(row) {
  const openable = row.state === 'completed' && !row.removed;
  const item = el('li', { className: `dl dl-${row.removed ? 'removed' : row.state}${openable ? ' openable' : ''}`, title: row.filename }, [
    el('span', { className: 'dl-type' }, [icon('file'), el('span', { className: 'dl-ext', textContent: extension(row.filename) })]),
    el('span', { className: 'dl-text' }, [
      el('span', { className: 'dl-name', textContent: row.filename }),
      el('span', { className: 'dl-status', textContent: row.status }),
      ...(row.state === 'progressing' ? [progressBar(row)] : []),
    ]),
    el(
      'span',
      { className: 'dl-actions' },
      actionsFor(row).map((name) => actionButton(name, row.id)),
    ),
  ]);
  if (openable) item.onclick = () => api.action('open', row.id);
  return item;
}

function render(rows) {
  $('dl-clear').disabled = !rows.some((row) => row.state !== 'progressing');
  $('dl-list').replaceChildren(
    ...(rows.length ? rows.map(rowItem) : [el('li', { className: 'dl-empty', textContent: 'Files you download show up here' })]),
  );
}

$('dl-clear').onclick = () => api.clear();
$('dl-folder').onclick = () => api.openFolder();
// Pointing at the panel keeps it open when a new download opened it.
document.body.addEventListener('mouseenter', () => api.pointer());
api.onRows(render);
render([]);
