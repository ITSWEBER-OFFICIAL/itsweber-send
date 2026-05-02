<script lang="ts">
  import IconBase from './IconBase.svelte';
  let { size = 24, title }: { size?: number | string; title?: string } = $props();
</script>

<IconBase {size} {title}>
  <rect x="6" y="4" width="4" height="16" rx="1" />
  <rect x="14" y="4" width="4" height="16" rx="1" />
</IconBase>
