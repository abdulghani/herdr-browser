<script>
  // The inline rename box over a tab or workspace name. Enter or leaving it saves, Escape cancels.
  let { value, onfinish } = $props();

  let input;
  let done = false;

  const finish = (commit) => {
    if (done) return;
    done = true;
    onfinish(commit, input.value);
  };

  $effect(() => {
    input.focus();
    input.select();
  });
</script>

<input
  bind:this={input}
  {value}
  class="rename w-full min-w-0 rounded-[3px] border border-accent bg-bg px-1 py-px text-fg outline-none"
  onclick={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
  onkeydown={(e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  }}
  onblur={() => finish(true)}
/>
