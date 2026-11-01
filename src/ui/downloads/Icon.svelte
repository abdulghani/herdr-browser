<script>
  // 16x16 line icons, drawn with the text color.
  const ICONS = {
    file: 'M4 1.75h5l3.25 3.25v9.25h-8.25z M9 1.75v3.25h3.25',
    show: 'M1.75 4.25v8.5h12.5v-7h-6.5l-1.5-1.5z',
    remove: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.75 9.25h5.5l.75-9.25',
  };

  let { name, class: className = 'size-4', strokeWidth = 1.3 } = $props();
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
