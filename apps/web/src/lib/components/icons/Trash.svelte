<script lang="ts">
  import IconBase from './IconBase.svelte';
  let { size = 24, title }: { size?: number | string; title?: string } = $props();
</script>

<IconBase {size} {title}>
  <path d="M3 6h18" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  <line x1="10" y1="11" x2="10" y2="17" />
  <line x1="14" y1="11" x2="14" y2="17" />
</IconBase>
