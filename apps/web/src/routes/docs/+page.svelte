<script lang="ts">
  import BookOpen from '$lib/components/icons/BookOpen.svelte';
  import Shield from '$lib/components/icons/Shield.svelte';
  import Key from '$lib/components/icons/Key.svelte';
  import Files from '$lib/components/icons/Files.svelte';
  import ExternalLink from '$lib/components/icons/ExternalLink.svelte';

  const sections = [
    {
      title: 'So funktioniert es',
      Icon: BookOpen,
      body:
        'Im Browser wird ein 256-Bit-Schlüssel erzeugt, jede Datei und ein Manifest mit AES-256-GCM verschlüsselt und nur die Geheimtexte zum Server hochgeladen. Der Schlüssel verlässt den Browser nie — er steckt im URL-Fragment.',
    },
    {
      title: 'Sicherheit',
      Icon: Shield,
      body:
        'Der Server speichert nur Geheimtext, IVs, Ablaufzeit und Download-Limit. Selbst wer den Server hackt, sieht keine Dateinamen, MIME-Typen oder Inhalte. Optionale Passwörter werden mit PBKDF2 (200 000 Iterationen) gegen den Master-Key gewickelt.',
    },
    {
      title: 'Schlüssel & Codes',
      Icon: Key,
      body:
        'Jeder Share kann zusätzlich zum Link über einen 4-Wort-Code geöffnet werden — leichter zu diktieren, gleiche Sicherheit. Optional ein Passwort, das vor dem Entschlüsseln abgefragt wird.',
    },
    {
      title: 'Speicher & Limits',
      Icon: Files,
      body:
        'Default-Quota pro Account: 5 GB. Ablaufzeit: 1 Stunde bis 30 Tage. Download-Limit: 1× / 5× / 20× / unbegrenzt — Self-destruct nach Erreichen.',
    },
  ];
</script>

<main class="page">
  <div class="hero">
    <h1>Doku</h1>
    <p class="lede">
      Kurze Übersicht über die Funktionsweise von ITSWEBER Send. Die vollständige technische
      Dokumentation liegt im
      <a href="https://github.com/itsweber/itsweber-send" target="_blank" rel="noopener noreferrer">
        Repository <ExternalLink size={14} />
      </a>.
    </p>
  </div>

  <div class="grid">
    {#each sections as section}
      {@const SvelteIcon = section.Icon}
      <article class="panel">
        <div class="panel-body">
          <div class="ico"><SvelteIcon size={22} /></div>
          <h2>{section.title}</h2>
          <p>{section.body}</p>
        </div>
      </article>
    {/each}
  </div>

  <section class="links panel">
    <div class="panel-h">
      <h2>Externe Doku</h2>
    </div>
    <div class="panel-body links-body">
      <a class="link-row" href="https://github.com/itsweber/itsweber-send/blob/main/docs/SECURITY.md" target="_blank" rel="noopener noreferrer">
        <span>Security &amp; Threat Model</span>
        <ExternalLink size={16} />
      </a>
      <a class="link-row" href="https://github.com/itsweber/itsweber-send/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer">
        <span>API-Referenz</span>
        <ExternalLink size={16} />
      </a>
      <a class="link-row" href="https://github.com/itsweber/itsweber-send/blob/main/docs/INSTALL.md" target="_blank" rel="noopener noreferrer">
        <span>Installation &amp; Self-Hosting</span>
        <ExternalLink size={16} />
      </a>
      <a class="link-row" href="https://github.com/itsweber/itsweber-send/blob/main/docs/CONFIG.md" target="_blank" rel="noopener noreferrer">
        <span>Konfiguration (env vars)</span>
        <ExternalLink size={16} />
      </a>
    </div>
  </section>
</main>

<style>
  .page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 56px 24px 100px;
  }
  .hero {
    text-align: center;
    margin-bottom: 36px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: clamp(28px, 4vw, 38px);
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--muted);
    margin: 0 auto;
    max-width: 580px;
    font-size: 16px;
    line-height: 1.6;
  }
  .lede a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }
  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .ico {
    display: inline-flex;
    color: var(--brand);
    background: var(--brand-soft);
    padding: 10px;
    border-radius: var(--radius);
    margin-bottom: 12px;
  }
  article h2 {
    margin: 0 0 6px;
    font-size: 17px;
  }
  article p {
    color: var(--muted);
    line-height: 1.55;
    margin: 0;
    font-size: 14px;
  }
  .links-body {
    padding: 0;
  }
  .link-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 22px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
    transition: background var(--transition-fast);
  }
  .link-row:last-child {
    border-bottom: 0;
  }
  .link-row:hover {
    background: var(--surface-2);
    color: var(--brand);
  }
</style>
