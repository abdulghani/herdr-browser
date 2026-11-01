// Dragging tabs and workspaces: what is being dragged, and which item it hovers to drop on.
// Tabs drop before another tab or into a workspace; workspaces drop before another workspace.

const drag = $state({ kind: null, id: null, over: null, effect: null });

const key = (kind, id) => `${kind}:${id}`;

// Event handlers for one tab ('tab') or workspace ('ws') item; onDrop runs with what was dropped.
export function draggable(kind, id, onDrop) {
  return {
    draggable: true,
    ondragstart: (e) => {
      Object.assign(drag, { kind, id, over: null, effect: null });
      e.dataTransfer.effectAllowed = 'move';
    },
    ondragend: () => Object.assign(drag, { kind: null, id: null, over: null, effect: null }),
    ondragover: (e) => {
      if (!drag.id || drag.id === id) return;
      if (kind === 'tab' && drag.kind !== 'tab') return;
      e.preventDefault();
      Object.assign(drag, { over: key(kind, id), effect: kind === 'ws' && drag.kind === 'tab' ? 'drop-into' : 'drop-before' });
    },
    ondragleave: () => {
      if (drag.over === key(kind, id)) Object.assign(drag, { over: null, effect: null });
    },
    ondrop: (e) => {
      e.preventDefault();
      if (drag.id && drag.id !== id) onDrop({ kind: drag.kind, id: drag.id });
    },
  };
}

// How an item looks while dragging: 'dragging', 'drop-before', 'drop-into' or null.
export function dragState(kind, id) {
  if (drag.kind === kind && drag.id === id) return 'dragging';
  return drag.over === key(kind, id) ? drag.effect : null;
}
