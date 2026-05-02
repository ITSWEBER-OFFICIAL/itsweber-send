<script lang="ts">
  /**
   * Shared wrapper for all icons. Lucide-style: stroke-based, currentColor,
   * 24x24 viewBox, rounded line caps and joins.
   */
  interface Props {
    size?: number | string;
    title?: string;
    children?: import('svelte').Snippet;
  }
  let { size = 24, title, children }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={title ? 'img' : 'presentation'}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
>
  {@render children?.()}
</svg>
