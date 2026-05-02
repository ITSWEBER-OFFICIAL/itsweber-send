<script lang="ts">
  import IconBase from './IconBase.svelte';
  let { size = 24, title }: { size?: number | string; title?: string } = $props();
</script>

<IconBase {size} {title}>
  <rect x="3" y="11" width="18" height="11" rx="2" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
</IconBase>
