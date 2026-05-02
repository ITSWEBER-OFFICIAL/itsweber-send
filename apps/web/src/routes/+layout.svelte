<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initI18n } from '$lib/i18n/index.js';
  import { theme } from '$lib/stores/theme.svelte.js';

  interface Props {
    children?: import('svelte').Snippet;
  }
  let { children }: Props = $props();

  initI18n();

  onMount(() => {
    theme.hydrate();
  });
</script>

{@render children?.()}
