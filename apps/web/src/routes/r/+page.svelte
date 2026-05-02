<script lang="ts">
  import { goto } from '$app/navigation';
  import Inbox from '$lib/components/icons/Inbox.svelte';
  import ChevronRight from '$lib/components/icons/ChevronRight.svelte';

  let input = $state('');
  let error = $state('');
  let loading = $state(false);

  const SHARE_ID_RE = /^[a-f0-9]{24}$/i;
  const WORDCODE_RE = /^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/i;

  function extractIdFromUrl(v: string): string | null {
    try {
      const u = new URL(v);
      const m = u.pathname.match(/\/d\/([a-f0-9]{24})/i);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async function resolveWordcode(code: string): Promise<void> {
    loading = true;
    try {
      const res = await fetch(`/api/v1/r/${encodeURIComponent(code.toLowerCase())}`);
      if (res.status === 404) {
        error = 'Kein Share mit diesem Wort-Code gefunden.';
        return;
      }
      if (res.status === 410) {
        const body = (await res.json()) as { error: string };
        error = body.error.includes('expired') ? 'Dieser Share ist abgelaufen.' : 'Download-Limit erreicht.';
        return;
      }
      if (!res.ok) {
        error = 'Fehler beim Abrufen des Share-Links.';
        return;
      }
      const { shareId } = (await res.json()) as { shareId: string };
      void goto(`/d/${shareId}`);
    } catch {
      error = 'Netzwerkfehler. Bitte erneut versuchen.';
    } finally {
      loading = false;
    }
  }

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    const v = input.trim();
    if (!v) {
      error = 'Bitte Share-Link, ID oder 4-Wort-Code eingeben.';
      return;
    }

    // Direct 24-char hex share ID
    if (SHARE_ID_RE.test(v)) {
      void goto(`/d/${v.toLowerCase()}`);
      return;
    }

    // Full URL with #k= fragment
    if (v.startsWith('http://') || v.startsWith('https://')) {
      const id = extractIdFromUrl(v);
      if (id) {
        try {
          const u = new URL(v);
          window.location.href = `/d/${id}${u.hash}`;
          return;
        } catch {
          // fall through
        }
      }
      error = 'Diese URL enthält keinen gültigen Share-Pfad (/d/<id>).';
      return;
    }

    // 4-word code: resolve via API
    if (WORDCODE_RE.test(v)) {
      await resolveWordcode(v);
      return;
    }

    error = 'Format nicht erkannt. Erwartet wird ein Share-Link, eine 24-stellige ID oder ein 4-Wort-Code (wort-wort-wort-wort).';
  }
</script>

<main class="page">
  <div class="hero">
    <div class="icon-wrap"><Inbox size={36} /></div>
    <h1>Empfangen</h1>
    <p class="lede">
      Share-Link, 24-stellige ID oder 4-Wort-Code eingeben.
    </p>
  </div>

  <form class="card panel" onsubmit={submit}>
    <div class="panel-body">
      <label class="lbl" for="code">Share-Link, ID oder 4-Wort-Code</label>
      <div class="row">
        <input
          id="code"
          class="input"
          type="text"
          placeholder="https://…/d/…#k=… oder platz-minute-wal-mond"
          bind:value={input}
          autocomplete="off"
          spellcheck="false"
          disabled={loading}
        />
        <button class="btn btn-primary" type="submit" disabled={loading}>
          {#if loading}
            <span class="spinner" aria-hidden="true"></span>
          {:else}
            <span>Öffnen</span>
            <ChevronRight size={16} />
          {/if}
        </button>
      </div>
      {#if error}
        <p class="err">{error}</p>
      {/if}
      <p class="hint">
        Der Schlüssel steckt im Fragment hinter der Raute (<code>#k=…</code>) und wird nie an den Server übertragen.
        <br />
        <strong>4-Wort-Code:</strong> findet den Share. Wenn ein Passwort gesetzt ist, fragt die Download-Seite es ab.
        Ohne Passwort brauchst du zusätzlich die vollständige URL mit Schlüssel.
      </p>
    </div>
  </form>
</main>

<style>
  .page {
    max-width: 640px;
    margin: 0 auto;
    padding: 56px 24px 100px;
  }
  .hero {
    text-align: center;
    margin-bottom: 32px;
  }
  .icon-wrap {
    display: inline-flex;
    padding: 14px;
    color: var(--brand);
    background: var(--brand-soft);
    border-radius: 50%;
    margin-bottom: 14px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: clamp(28px, 4vw, 38px);
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--muted);
    margin: 0 auto;
    max-width: 480px;
    font-size: 16px;
    line-height: 1.5;
  }
  .lbl {
    display: block;
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .row .input {
    font-family: var(--font-mono);
  }
  .err {
    color: var(--danger);
    font-size: 13px;
    margin: 10px 0 0;
  }
  .hint {
    color: var(--dim);
    font-size: 12px;
    line-height: 1.5;
    margin: 14px 0 0;
  }
  .hint code {
    font-family: var(--font-mono);
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(10,26,38,0.3);
    border-top-color: #0a1a26;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 480px) {
    .row {
      flex-direction: column;
    }
  }
</style>
