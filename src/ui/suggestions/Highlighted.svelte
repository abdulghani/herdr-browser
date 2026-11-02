<script lang="ts">
  // Text with the fuzzy-matched characters in bold.
  import { highlighted } from './highlight';

  let { text, positions }: { text: string; positions: number[] } = $props();
</script>

{#each highlighted(text, positions) as run, i (i)}{#if run.bold}<b class="font-semibold text-accent">{run.text}</b
    >{:else}{run.text}{/if}{/each}
