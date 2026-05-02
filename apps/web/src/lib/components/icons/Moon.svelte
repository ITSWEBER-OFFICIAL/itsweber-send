<script lang="ts">
  import IconBase from './IconBase.svelte';
  let { size = 24, title }: { size?: number | string; title?: string } = $props();
</script>

<IconBase {size} {title}>
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
</IconBase>
