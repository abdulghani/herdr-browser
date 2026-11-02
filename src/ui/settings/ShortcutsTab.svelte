<script lang="ts">
  import { shortcutsFor } from './shortcuts';

  let { platform }: { platform: string | undefined } = $props();
</script>

<h2 class="mb-1.5 text-[15px] font-bold">Shortcuts</h2>
<p class="mb-4 leading-[1.5] text-muted">
  herdr-style keys start with the prefix <kbd>Ctrl+Space</kbd>, then one key. While typing in a text box, <kbd>Alt</kbd>+arrows move the
  cursor instead.
</p>
<table id="shortcut-list" class="w-full border-collapse">
  <tbody>
    {#if platform}
      {#each shortcutsFor(platform) as [action, keys] (action)}
        <tr class="group">
          <td class="border-t border-border py-[7px] group-first:border-t-0">{action}</td>
          <td class="border-t border-border py-[7px] text-right group-first:border-t-0"><kbd>{keys}</kbd></td>
        </tr>
      {/each}
    {/if}
  </tbody>
</table>
