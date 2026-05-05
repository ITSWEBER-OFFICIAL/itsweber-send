<div class="doc-page">
  <div class="page-hero">
    <h1>Installation &amp; Self-Hosting</h1>
    <p class="lede">ITSWEBER Send in einem einzelnen Docker-Container betreiben.</p>
  </div>

  <section class="panel">
    <div class="panel-h"><h2>Voraussetzungen</h2></div>
    <div class="panel-body">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Abhängigkeit</th><th>Mindestversion</th><th>Anmerkung</th></tr></thead>
          <tbody>
            <tr><td>Docker</td><td>24</td><td>Für containerbasiertes Deployment</td></tr>
            <tr><td>Docker Compose</td><td>2.20</td><td>Im Docker Desktop enthalten</td></tr>
            <tr><td>Node.js</td><td>22 LTS</td><td>Nur zum Bauen aus dem Quellcode</td></tr>
            <tr><td>pnpm</td><td>9</td><td>Package-Manager für das Monorepo</td></tr>
          </tbody>
        </table>
      </div>
      <p class="hint">
        Ein Reverse-Proxy mit TLS wird in der Produktion dringend empfohlen. Das mitgelieferte <code
          >docker-compose.yml</code
        > nutzt Caddy, das automatisch ein Let's-Encrypt-Zertifikat erhält.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Docker (empfohlen)</h2></div>
    <div class="panel-body prose">
      <h3>1. Compose-Datei herunterladen</h3>
      <pre><code
          >curl -O https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/ITSWEBER-OFFICIAL/itsweber-send/main/docker/Caddyfile.example</code
        ></pre>

      <h3>2. Hostname setzen</h3>
      <pre><code
          >export BASE_URL=https://send.example.com
# Caddyfile.example bearbeiten und send.example.com durch eigenen Hostnamen ersetzen.</code
        ></pre>

      <h3>3. Starten</h3>
      <pre><code>docker compose up -d</code></pre>
      <p>
        Caddy holt beim ersten Start ein Zertifikat von Let's Encrypt. Die Anwendung ist dann unter <code
          >https://send.example.com</code
        > erreichbar.
      </p>

      <h3>Persistente Daten</h3>
      <p>
        Standardmäßig hält ein Docker-Volume <code>send-data</code> die SQLite-Datenbank und die hochgeladenen
        Blobs. Alle Daten überleben Container-Neustarts und Upgrades.
      </p>
      <pre><code
          >send-data/
  shares.db        # SQLite-Datenbank
  uploads/         # verschlüsselter Blob-Speicher</code
        ></pre>
      <p>Für ein Backup das gesamte Volume kopieren oder ein Host-Verzeichnis einhängen:</p>
      <pre><code
          >volumes:
  - /path/on/host/send-data:/data</code
        ></pre>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>LAN / Home-Lab</h2></div>
    <div class="panel-body prose">
      <p>Für Tests im lokalen Netz ohne öffentliche Domain:</p>
      <pre><code>docker compose -f docker/docker-compose.lan.yml up -d</code></pre>
      <p>
        Dies nutzt Caddy mit selbst-signiertem TLS. Der Browser zeigt beim ersten Besuch eine
        Zertifikatswarnung — einmalig als Ausnahme hinzufügen. Alle Web-Crypto-Operationen setzen
        HTTPS voraus; reines HTTP wird für Upload- und Download-Seiten nicht unterstützt.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Aus dem Quellcode bauen</h2></div>
    <div class="panel-body prose">
      <pre><code
          >git clone https://github.com/ITSWEBER-OFFICIAL/itsweber-send
cd itsweber-send

# Abhängigkeiten installieren
pnpm install

# Entwicklungsmodus (API auf :3000, Web-UI auf :5173)
pnpm dev</code
        ></pre>

      <p>Produktion-Artefakt bauen:</p>
      <pre><code>pnpm build</code></pre>

      <p>Docker-Image lokal bauen und starten:</p>
      <pre><code
          >docker build -f docker/Dockerfile -t itsweber-send:local .
docker run -d --name itsweber-send -p 3000:3000 -v send-data:/data \
  -e NODE_ENV=production -e BASE_URL=http://localhost:3000 \
  itsweber-send:local</code
        ></pre>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Upgrade</h2></div>
    <div class="panel-body prose">
      <p>Wenn eine neue Version veröffentlicht wird:</p>
      <pre><code
          >docker compose pull
docker compose up -d</code
        ></pre>
      <p>
        Die Anwendung wendet beim Start ausstehende Datenbankmigrationen automatisch an. Zwischen
        Patch- und Minor-Releases sind keine manuellen SQL-Schritte erforderlich.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Deinstallation</h2></div>
    <div class="panel-body prose">
      <pre><code
          ># Container stoppen und entfernen
docker compose down

# Auch alle Daten löschen (unwiderruflich)
docker compose down -v</code
        ></pre>
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
    font-size: clamp(22px, 3vw, 30px);
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--muted);
    margin: 0;
    font-size: 15px;
    line-height: 1.55;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    margin-bottom: 20px;
  }
  .panel-h {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
  }
  .panel-h h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
  }
  .panel-body {
    padding: 20px;
  }

  .hint {
    margin: 14px 0 0;
    font-size: 13.5px;
    color: var(--muted);
    line-height: 1.55;
  }
  .hint code {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }

  /* Prose */
  .prose p {
    margin: 0 0 14px;
    font-size: 14px;
    color: var(--text);
    line-height: 1.65;
  }
  .prose p:last-child {
    margin-bottom: 0;
  }
  .prose h3 {
    font-size: 14px;
    font-weight: 700;
    margin: 20px 0 8px;
    color: var(--text);
  }
  .prose h3:first-child {
    margin-top: 0;
  }
  .prose code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    color: var(--text);
  }
  .prose pre {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    overflow-x: auto;
    margin: 0 0 14px;
  }
  .prose pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 12.5px;
    line-height: 1.6;
  }

  /* Table */
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    text-align: left;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dim);
    font-weight: 600;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
</style>
