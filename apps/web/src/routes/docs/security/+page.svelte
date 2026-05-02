<div class="doc-page">
  <div class="page-hero">
    <h1>Sicherheit &amp; Threat-Model</h1>
    <p class="lede">
      Architektur, kryptografisches Design und Härtungsmaßnahmen von ITSWEBER Send.
    </p>
  </div>

  <section class="panel">
    <div class="panel-h"><h2>Bedrohungsmodell</h2></div>
    <div class="panel-body prose">
      <p>ITSWEBER Send ist für das folgende Bedrohungsszenario ausgelegt:</p>
      <ul>
        <li>
          <strong>Vertrauenswürdiger Browser, nicht vertrauenswürdiger Server.</strong>
          Ein kompromittierter Server (oder ein böswilliger Hoster) kann Dateiinhalte und Dateinamen nicht
          lesen. Der Server speichert ausschließlich Ciphertext. Der Verschlüsselungsschlüssel lebt ausschließlich
          im URL-Fragment, das Browser nicht zum Server senden.
        </li>
        <li>
          <strong>Passiver Netzwerkbeobachter.</strong>
          Transport-Layer-Security (HTTPS via Caddy + HSTS) verhindert, dass ein passiver Beobachter den
          Datenverkehr lesen kann. Strenge Header-Policies verhindern Ressourcen-Leaks über Drittanfragen.
        </li>
        <li>
          <strong>Brute-Force und Enumeration.</strong>
          Rate-Limiting auf Login (5/min/IP), Registrierung (3/10 min/IP) und Uploads (20/h/IP) begrenzt
          automatisierten Missbrauch. Share-IDs sind 96-Bit-Zufallswerte — Enumeration ist nicht praktikabel.
        </li>
        <li>
          <strong>Cross-Site-Scripting.</strong>
          Eine strikte Content-Security-Policy beschränkt Script-Ausführung auf Same-Origin-Ressourcen.
          Keine Drittanbieter-Skripte oder CDN-Ressourcen werden geladen.
        </li>
      </ul>
      <p class="note">
        <strong>Außerhalb des Scope:</strong> Ein Angreifer, der bereits die vollständige Share-URL (inkl.
        Fragment) kennt, kann den Share entschlüsseln — das ist by Design. Die URL ist die Capability.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Kryptografisches Design</h2></div>
    <div class="panel-body prose">
      <h3>Primitive</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Primitiv</th><th>Parameter</th></tr></thead>
          <tbody>
            <tr
              ><td>Symmetrische Chiffre</td><td
                >AES-256-GCM (256-Bit-Key, 96-Bit-IV, 128-Bit Auth-Tag)</td
              ></tr
            >
            <tr
              ><td>Key-Derivation (Passwort)</td><td
                >PBKDF2-SHA-256, 200 000 Iterationen, 128-Bit-Salt</td
              ></tr
            >
            <tr
              ><td>Zufallsquelle</td><td
                ><code>crypto.getRandomValues</code> (Browser) / <code>crypto.randomBytes</code> (Node)</td
              ></tr
            >
            <tr><td>Encoding</td><td>base64url (RFC 4648 §5)</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Verschlüsselungsablauf</h3>
      <ol>
        <li>
          Der Browser generiert einen 256-Bit <code>master_key</code> mit
          <code>crypto.getRandomValues</code>.
        </li>
        <li>
          Jeder Datei-Blob wird separat mit AES-256-GCM und einem einzigartigen pro-Blob-IV
          verschlüsselt.
        </li>
        <li>
          Ein Manifest (mit verschlüsselten Dateinamen, Größen und MIME-Typen) wird mit demselben
          Key verschlüsselt.
        </li>
        <li>
          Alle Ciphertexte werden an den Server übertragen. Der <code>master_key</code> wird nie übertragen.
        </li>
        <li>
          Die Share-URL enthält den <code>master_key</code> im Fragment:
          <code>https://host/d/&lt;id&gt;#k=&lt;base64url&gt;</code>. Fragmente werden nicht in
          HTTP-Requests gesendet und nicht in Server-Logs erfasst.
        </li>
      </ol>

      <h3>Optionales Passwort</h3>
      <p>
        Wenn ein Passwort gesetzt ist, wird der <code>master_key</code> zusätzlich eingewickelt:
      </p>
      <pre><code
          >salt       = random(16 bytes)
wrap_key   = PBKDF2(password, salt, 200_000 iterations, SHA-256) → 256 bits
wrapped_key = AES-GCM-encrypt(master_key, wrap_key, iv_wrap)</code
        ></pre>
      <p>
        Der Server speichert <code>salt</code>, <code>iv_wrap</code> und <code>wrapped_key</code>.
        Zum Entschlüsseln muss der Empfänger entweder die vollständige URL (mit
        <code>master_key</code>) kennen oder das Passwort angeben, aus dem der
        <code>master_key</code> abgeleitet werden kann. Der Server kann das Passwort nicht umgehen, da
        er weder das Klartext-Passwort noch den abgeleiteten Key kennt.
      </p>

      <h3>Was der Server sieht</h3>
      <p>Der Server speichert und kann beobachten:</p>
      <ul>
        <li>Opake Blobs (Ciphertext). Größen und Anzahl sind sichtbar.</li>
        <li>
          Share-Metadaten: Erstellungszeit, Ablauf, Download-Limit, ob ein Passwort gesetzt ist.
        </li>
        <li>
          Für passwortgeschützte Shares: Key-Wrapping-Material (<code>salt</code>,
          <code>iv_wrap</code>, <code>wrapped_key</code>), aber nicht das Passwort selbst.
        </li>
        <li>IP-Adressen in Logs (abhängig von der Log-Retention-Policy).</li>
      </ul>
      <p>
        Der Server <strong>kann nicht</strong> beobachten: Dateiinhalte, Dateinamen, MIME-Typen oder den
        Master-Key.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>HTTP-Security-Header</h2></div>
    <div class="panel-body prose">
      <p>
        Folgende Header werden von <code>@fastify/helmet</code> auf jede Antwort gesetzt und durch Caddy
        als Defense-in-Depth-Layer erzwungen:
      </p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Header</th><th>Wert (Zusammenfassung)</th></tr></thead>
          <tbody>
            <tr
              ><td><code>Content-Security-Policy</code></td><td
                >Nur Same-Origin-Skripte und -Ressourcen</td
              ></tr
            >
            <tr
              ><td><code>Cross-Origin-Opener-Policy</code></td><td><code>same-origin</code></td></tr
            >
            <tr
              ><td><code>Cross-Origin-Embedder-Policy</code></td><td><code>credentialless</code></td
              ></tr
            >
            <tr
              ><td><code>Cross-Origin-Resource-Policy</code></td><td><code>same-origin</code></td
              ></tr
            >
            <tr
              ><td><code>Strict-Transport-Security</code></td><td
                ><code>max-age=63072000; includeSubDomains; preload</code> (2 Jahre)</td
              ></tr
            >
            <tr><td><code>Referrer-Policy</code></td><td><code>no-referrer</code></td></tr>
            <tr><td><code>X-Content-Type-Options</code></td><td><code>nosniff</code></td></tr>
            <tr><td><code>X-Frame-Options</code></td><td><code>DENY</code></td></tr>
            <tr
              ><td><code>Permissions-Policy</code></td><td
                >Alle nicht benötigten Browser-APIs deaktiviert</td
              ></tr
            >
            <tr><td><code>Origin-Agent-Cluster</code></td><td><code>?1</code></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Authentifizierung</h2></div>
    <div class="panel-body prose">
      <ul>
        <li>
          Passwörter werden mit <strong>Argon2id</strong> gehasht (OWASP 2026: 64 MB Speicher, 3 Iterationen,
          Parallelism 4).
        </li>
        <li>
          Session-Tokens sind 32-Byte kryptografisch zufällige Werte, gespeichert in einem <code
            >HttpOnly</code
          >, <code>Secure</code>, <code>SameSite=Strict</code> Cookie namens <code>sid</code>.
        </li>
        <li>Der erste registrierte Nutzer erhält automatisch die Admin-Rolle.</li>
        <li>
          Login ist auf 5 Versuche pro IP pro Minute begrenzt. Ein Constant-Time-Hash läuft auch für
          nicht existierende Accounts, um Email-Enumeration via Timing zu verhindern.
        </li>
        <li>Registrierung ist auf 3 Accounts pro IP pro 10 Minuten begrenzt.</li>
      </ul>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Container-Härtung</h2></div>
    <div class="panel-body prose">
      <ul>
        <li>Läuft als UID 10001, nie als root.</li>
        <li>
          Read-only Root-Filesystem (<code>read_only: true</code>); nur <code>/tmp</code> ist über
          ein 64-MiB-<code>tmpfs</code> beschreibbar.
        </li>
        <li><code>cap_drop: ALL</code> — keine Linux-Capabilities.</li>
        <li>
          <code>security_opt: no-new-privileges:true</code> — verhindert Privilege-Escalation via setuid-Binaries.
        </li>
        <li>
          Healthcheck über Node's eingebettetes <code>http</code>-Modul; keine extra Binaries (<code
            >wget</code
          >, <code>curl</code>) im Runtime-Image.
        </li>
      </ul>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Dependency-Scanning</h2></div>
    <div class="panel-body prose">
      <p>
        Die GitHub Actions CI-Pipeline führt Trivy gegen das Container-Image bei jedem Push auf
        <code>main</code> aus. HIGH- und CRITICAL-Findings werden gemeldet; die Pipeline blockiert Releases
        bei ungefixten Schwachstellen.
      </p>
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
  .prose ul,
  .prose ol {
    margin: 0 0 14px;
    padding-left: 22px;
  }
  .prose li {
    font-size: 14px;
    color: var(--text);
    line-height: 1.65;
    margin-bottom: 6px;
  }
  .prose h3 {
    font-size: 14px;
    font-weight: 700;
    margin: 20px 0 10px;
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
  .prose .note {
    background: color-mix(in srgb, var(--brand) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--brand) 20%, var(--border));
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    font-size: 13.5px;
  }
  .prose strong {
    font-weight: 600;
  }

  /* Table */
  .table-wrap {
    overflow-x: auto;
    margin: 0 0 14px;
  }
  .table-wrap:last-child {
    margin-bottom: 0;
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
  td code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
</style>
