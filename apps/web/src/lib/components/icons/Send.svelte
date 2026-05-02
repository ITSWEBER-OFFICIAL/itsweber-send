<script lang="ts">
  import IconBase from './IconBase.svelte';
  let { size = 24, title }: { size?: number | string; title?: string } = $props();
</script>

<IconBase {size} {title}>
  <path d="M22 2 11 13" />
  <path d="M22 2 15 22 11 13 2 9z" />
</IconBase>
