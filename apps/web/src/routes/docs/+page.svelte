<script lang="ts">
  import BookOpen from '$lib/components/icons/BookOpen.svelte';
  import Shield from '$lib/components/icons/Shield.svelte';
  import Key from '$lib/components/icons/Key.svelte';
  import Files from '$lib/components/icons/Files.svelte';
  import Gauge from '$lib/components/icons/Gauge.svelte';
  import Globe from '$lib/components/icons/Globe.svelte';
  import ChevronRight from '$lib/components/icons/ChevronRight.svelte';

  const cards = [
    {
      Icon: BookOpen,
      title: 'So funktioniert es',
      body: 'Im Browser wird ein 256-Bit-Schlüssel erzeugt, jede Datei mit AES-256-GCM verschlüsselt und nur der Geheimtext zum Server hochgeladen. Der Schlüssel verlässt den Browser nie — er steckt im URL-Fragment hinter dem #.',
    },
    {
      Icon: Shield,
      title: 'Sicherheitsmodell',
      body: 'Der Server speichert ausschließlich Ciphertext. Selbst bei vollständiger Kompromittierung des Servers bleiben Dateinamen, MIME-Typen und Inhalte unsichtbar. Passwörter werden mit Argon2id gehasht (OWASP 2026).',
    },
    {
      Icon: Key,
      title: 'Schlüssel & Codes',
      body: 'Jeder Share hat eine lange URL mit #k=…-Fragment. Zusätzlich gibt es einen 4-Wort-Code als Kurzlink. Wer den Share rein per Stimme weitergeben will, setzt ein Passwort: Code findet den Share, Passwort entschlüsselt ihn (PBKDF2, 200.000 Iterationen).',
    },
    {
      Icon: Gauge,
      title: 'Speicher & Limits',
      body: 'Standard-Quota pro Account: 5 GB. Ablaufzeit: 1 Stunde bis 30 Tage. Download-Limit: 1× / 5× / 20× / unbegrenzt. Nach Erreichen des Limits wird der Share automatisch gelöscht.',
    },
    {
      Icon: Files,
      title: 'Multi-File & Resume',
      body: 'Mehrere Dateien können in einem Share gebündelt werden. Uploads laufen über das tus.io-Protokoll mit Chunk-Upload und automatischem Fortsetzen bei Verbindungsunterbrechung.',
    },
    {
      Icon: Globe,
      title: 'Self-Hosting',
      body: 'Ein einzelner Docker-Container, keine externe Datenbank. SQLite läuft eingebettet, Dateien liegen im persistenten Volume. Caddy übernimmt HTTPS und Security-Header automatisch.',
    },
  ];

  const quickLinks = [
    { href: '/docs/security', label: 'Sicherheit & Threat Model' },
    { href: '/docs/api', label: 'API-Referenz' },
    { href: '/docs/install', label: 'Installation & Self-Hosting' },
    { href: '/docs/config', label: 'Konfiguration (Env-Vars)' },
  ];
</script>

<div class="doc-page">
  <div class="page-hero">
    <h1>Dokumentation</h1>
    <p class="lede">Alles über Funktionsweise, Sicherheit und Betrieb von ITSWEBER Send.</p>
    <span class="version-badge">v1.0.0</span>
  </div>

  <div class="card-grid">
    {#each cards as card}
      {@const Icon = card.Icon}
      <article class="info-card panel">
        <div class="panel-body">
          <div class="ico"><Icon size={20} /></div>
          <h2>{card.title}</h2>
          <p>{card.body}</p>
        </div>
      </article>
    {/each}
  </div>

  <section class="quick-nav panel">
    <div class="panel-h">
      <h2>Abschnitte</h2>
    </div>
    <div class="nav-list">
      {#each quickLinks as link}
        <a class="nav-row" href={link.href}>
          <span>{link.label}</span>
          <ChevronRight size={16} />
        </a>
      {/each}
    </div>
  </section>

  <section class="faq panel">
    <div class="panel-h"><h2>Häufige Fragen</h2></div>
    <div class="panel-body faq-body">
      <details class="faq-item">
        <summary>Kann der Server-Betreiber meine Dateien lesen?</summary>
        <p>
          Nein. Alle Dateien werden vor dem Upload im Browser verschlüsselt. Der Server empfängt
          ausschließlich Ciphertext. Dateinamen, MIME-Typen und Inhalte sind für den Server nicht
          sichtbar.
        </p>
      </details>
      <details class="faq-item">
        <summary>Was passiert mit dem Schlüssel?</summary>
        <p>
          Der Schlüssel steht im URL-Fragment (#k=…). Browser senden Fragmente nicht im
          HTTP-Request. Er landet weder in Server-Logs noch wird er übertragen. Nur wer die
          vollständige URL kennt, kann entschlüsseln.
        </p>
      </details>
      <details class="faq-item">
        <summary>Was bedeutet der 4-Wort-Code?</summary>
        <p>
          Jeder Share bekommt einen menschenlesbaren Code aus 4 deutschen Wörtern (z. B. <code
            >tasche-lampe-schnee-ofen</code
          >). Der Code kann auf der Empfangen-Seite eingegeben werden, um den Share zu finden.
          Mathematisch trägt er rund 32 Bit Information — zu wenig, um einen 256-Bit-Schlüssel zu
          codieren.
        </p>
        <p>
          <strong>Per Stimme teilen:</strong> Wenn du beim Upload zusätzlich ein Passwort setzt,
          reichen <em>Code + Passwort</em> aus, um den Share vollständig zu entschlüsseln. Der Code findet
          den Share, das Passwort leitet via PBKDF2 den Schlüssel ab. Beides ist kurz genug, um es am
          Telefon zu diktieren.
        </p>
        <p>
          <strong>Ohne Passwort</strong> dient der Code nur als Kurzlink zum Auffinden — der
          Empfänger braucht zusätzlich die vollständige URL mit <code>#k=…</code>.
        </p>
      </details>
      <details class="faq-item">
        <summary>Wie richte ich ITSWEBER Send ein?</summary>
        <p>
          Ein Docker-Container genügt. Mit Caddy als Reverse-Proxy erhält der Container automatisch
          ein TLS-Zertifikat. Details stehen in der <a href="/docs/install"
            >Installationsanleitung</a
          >.
        </p>
      </details>
      <details class="faq-item">
        <summary>Gibt es eine REST-API?</summary>
        <p>
          Ja. Alle Endpunkte sind unter <a href="/api/v1/docs">/api/v1/docs</a> als interaktive OpenAPI-Dokumentation
          erreichbar. API-Tokens können im Account-Bereich erstellt werden.
        </p>
      </details>
    </div>
  </section>
</div>

<style>
  .doc-page {
    max-width: 860px;
  }
  .page-hero {
    margin-bottom: 32px;
  }
  .page-hero h1 {
    margin: 0 0 8px;
    font-size: clamp(24px, 3vw, 32px);
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--muted);
    margin: 0 0 12px;
    font-size: 15px;
    line-height: 1.55;
  }
  .version-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--brand-strong);
    background: var(--brand-soft);
    padding: 3px 10px;
    border-radius: 9999px;
  }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  @media (max-width: 600px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
  .info-card .ico {
    display: inline-flex;
    color: var(--brand);
    background: var(--brand-soft);
    padding: 9px;
    border-radius: var(--radius-sm);
    margin-bottom: 10px;
  }
  .info-card h2 {
    margin: 0 0 5px;
    font-size: 15px;
    font-weight: 600;
  }
  .info-card p {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
    margin: 0;
  }

  .quick-nav {
    margin-bottom: 20px;
  }
  .nav-list {
    padding: 0;
  }
  .nav-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 13px 20px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
    font-size: 14px;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .nav-row:last-child {
    border-bottom: 0;
  }
  .nav-row:hover {
    background: var(--surface-2);
    color: var(--brand);
  }

  .faq {
    margin-bottom: 0;
  }
  .faq-body {
    padding: 0;
  }
  .faq-item {
    border-bottom: 1px solid var(--border);
    padding: 14px 20px;
  }
  .faq-item:last-child {
    border-bottom: 0;
  }
  .faq-item summary {
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text);
    list-style: none;
    display: flex;
    justify-content: space-between;
  }
  .faq-item summary::-webkit-details-marker {
    display: none;
  }
  .faq-item[open] summary {
    color: var(--brand);
  }
  .faq-item p {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.6;
  }
  .faq-item a {
    color: var(--brand);
    text-decoration: none;
  }
  .faq-item a:hover {
    text-decoration: underline;
  }
  .faq-item code {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .faq-item p + p {
    margin-top: 8px;
  }
</style>
