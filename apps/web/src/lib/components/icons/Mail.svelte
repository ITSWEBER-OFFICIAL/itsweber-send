<script lang="ts">
  import IconBase from './IconBase.svelte';
  let { size = 24, title }: { size?: number | string; title?: string } = $props();
</script>

<IconBase {size} {title}>
  <rect x="2" y="4" width="20" height="16" rx="2" />
  <path d="m22 7-10 5L2 7" />
</IconBase>
