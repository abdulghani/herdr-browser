<script lang="ts">
  // 16x16 line icons, drawn with the text color.
  const ICONS: Record<string, string> = {
    file: 'M4 1.75h5l3.25 3.25v9.25h-8.25z M9 1.75v3.25h3.25',
    show: 'M1.75 4.25v8.5h12.5v-7h-6.5l-1.5-1.5z',
    pause: 'M5.5 3.5v9M10.5 3.5v9',
    resume: 'M5 3.25v9.5l7.5-4.75z',
    cancel: 'M4 4l8 8M12 4l-8 8',
    retry: 'M13 8a5 5 0 1 1-1.46-3.54M13 2.5v3h-3',
    remove: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.75 9.25h5.5l.75-9.25',
  };

  let { name, class: className = 'size-4', strokeWidth = 1.3 }: { name: string; class?: string; strokeWidth?: number } = $props();
</script>

<svg
  class={className}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={ICONS[name]} /></svg
>
