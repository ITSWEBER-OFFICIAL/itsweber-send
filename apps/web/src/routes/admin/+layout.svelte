<script lang="ts">
  import AccountSidebar from '$lib/components/AccountSidebar.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }
  let { children }: Props = $props();
</script>

<div class="layout">
  <AccountSidebar variant="admin" />
  <main class="content">
    {@render children?.()}
  </main>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    max-width: 1320px;
    margin: 0 auto;
    min-height: calc(100vh - 60px);
  }
  .content {
    padding: 36px 32px 80px;
    max-width: 1080px;
    width: 100%;
    /* Without min-width: 0 a grid item refuses to shrink below the
       intrinsic width of its widest descendant (long emails, share IDs,
       OTP URIs), which on phones produces page-level horizontal scroll. */
    min-width: 0;
  }
  @media (max-width: 880px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .content {
      padding: 24px 16px 60px;
    }
  }
</style>
