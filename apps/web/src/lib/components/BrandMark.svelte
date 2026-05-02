<script lang="ts">
  /**
   * Brand mark for ITSWEBER Send — "Paper Plane Crypt".
   * Stroke and fill use `currentColor` so the mark inherits its surrounding text color.
   */
  interface Props {
    size?: number | string;
    title?: string;
  }
  let { size = 32, title = 'ITSWEBER Send' }: Props = $props();

  // SSR-safe unique id per instance so multiple marks on a page do not collide.
  const uid = $props.id();
  const maskId = `paperPlaneMask-${uid}`;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 120 120"
  role="img"
  aria-label={title}
  fill="none"
>
  <defs>
    <mask id={maskId}>
      <rect width="120" height="120" fill="white" />
      <path d="M 38 72 L 86 50 L 60 86 L 60 72 Z" fill="black" />
      <path d="M 38 72 L 60 72 L 60 86 Z" fill="black" />
    </mask>
  </defs>
  <path
    d="M 42 50 L 42 38 a 18 18 0 0 1 36 0 L 78 50"
    fill="none"
    stroke="currentColor"
    stroke-width="9"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <rect x="26" y="50" width="68" height="56" rx="11" fill="currentColor" mask="url(#{maskId})" />
</svg>
