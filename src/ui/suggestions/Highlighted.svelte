<script>
  // Text with the fuzzy-matched characters in bold.
  import { highlighted } from './highlight.js';

  let { text, positions } = $props();
</script>

{#each highlighted(text, positions) as run, i (i)}{#if run.bold}<b class="font-semibold text-accent">{run.text}</b
    >{:else}{run.text}{/if}{/each}
