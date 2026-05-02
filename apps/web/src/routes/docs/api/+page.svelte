<div class="doc-page">
  <div class="page-hero">
    <h1>API-Referenz</h1>
    <p class="lede">
      Alle Endpunkte leben unter dem Präfix <code>/api/v1/</code>. Die maschinenlesbare
      OpenAPI-3.0-Spezifikation wird unter
      <a href="/api/v1/openapi.json" class="link">/api/v1/openapi.json</a>
      bereitgestellt. Eine interaktive Swagger-UI ist unter
      <a href="/api/v1/docs" class="link">/api/v1/docs</a> erreichbar.
    </p>
  </div>

  <div class="auth-note panel">
    <div class="panel-body">
      <p>
        <strong>Authentifizierung</strong> nutzt ein Session-Cookie (<code>sid</code>), das von den
        Login- und Register-Endpunkten gesetzt wird. Das Cookie ist <code>HttpOnly</code>,
        <code>SameSite=Strict</code> und in der Produktion <code>Secure</code>.
      </p>
      <p>
        <strong>Fehlerformat</strong> — alle 4xx/5xx-Antworten geben einen JSON-Body zurück:
      </p>
      <pre class="code-inline"><code>{'{'} "error": "Human-readable description" {'}'}</code></pre>
    </div>
  </div>

  <section class="panel">
    <div class="panel-h"><h2>System</h2></div>
    <div class="panel-body prose">
      <div class="endpoint">
        <div class="ep-head">
          <span class="method get">GET</span>
          <code class="ep-path">/health</code>
        </div>
        <p>Gibt den Betriebsstatus des Servers zurück. Kein Rate-Limiting.</p>
        <div class="resp-block">
          <span class="resp-label">200</span>
          <pre><code
              >{`{
  "status": "ok",
  "uptimeMs": 123456,
  "version": "1.0.0"
}`}</code
            ></pre>
        </div>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method get">GET</span>
          <code class="ep-path">/ready</code>
        </div>
        <p>
          Gibt 200 zurück wenn die Datenbank erreichbar ist, 503 andernfalls. Für
          Container-Readiness-Probes.
        </p>
        <div class="resp-row">
          <div class="resp-block">
            <span class="resp-label">200</span>
            <pre><code>{'{'} "ready": true {'}'}</code></pre>
          </div>
          <div class="resp-block">
            <span class="resp-label err">503</span>
            <pre><code>{'{'} "ready": false, "error": "Database not available" {'}'}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Shares</h2></div>
    <div class="panel-body prose">
      <div class="endpoint">
        <div class="ep-head">
          <span class="method post">POST</span>
          <code class="ep-path">/api/v1/upload</code>
          <span class="badge">20/h/IP</span>
        </div>
        <p>
          Einen oder mehrere Dateien als neuen verschlüsselten Share hochladen. Content-Type: <code
            >multipart/form-data</code
          >. Alle Datei-Blobs und das Manifest müssen client-seitig mit AES-256-GCM verschlüsselt
          sein.
        </p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Part</th><th>Typ</th><th>Pflicht</th><th>Beschreibung</th></tr></thead>
            <tbody>
              <tr
                ><td><code>meta</code></td><td>field (JSON)</td><td>Ja</td><td
                  >Share-Metadaten (s. u.)</td
                ></tr
              >
              <tr
                ><td><code>manifest-iv</code></td><td>field</td><td>Ja</td><td
                  >Base64url-codierter 12-Byte-IV für den Manifest-Ciphertext</td
                ></tr
              >
              <tr
                ><td><code>manifest</code></td><td>file</td><td>Ja</td><td
                  >Verschlüsselter Manifest-Blob</td
                ></tr
              >
              <tr
                ><td><code>blob-NNNN</code></td><td>file</td><td>Ja</td><td
                  >Verschlüsselter Datei-Ciphertext, 4-stelliger Index ab <code>0001</code></td
                ></tr
              >
              <tr
                ><td><code>blob-NNNN-iv</code></td><td>field</td><td>Ja</td><td
                  >Base64url-codierter 12-Byte-IV für den entsprechenden Blob</td
                ></tr
              >
            </tbody>
          </table>
        </div>
        <div class="resp-block">
          <span class="resp-label">201</span>
          <pre><code
              >{`{
  "id": "a3f1b8c2d4e56789ab01cd23",
  "wordcode": "tasche-lampe-schnee-ofen",
  "expiresAt": "2026-05-03T18:00:00.000Z"
}`}</code
            ></pre>
        </div>
        <p class="resp-codes">
          <span class="rc">400</span> fehlende oder ungültige Parts / Meta-Validierung
          <span class="rc">413</span> Quota überschritten
        </p>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method get">GET</span>
          <code class="ep-path">/api/v1/download/:id/manifest</code>
        </div>
        <p>Share-Metadaten und verschlüsseltes Manifest abrufen.</p>
        <div class="resp-block">
          <span class="resp-label">200</span>
          <pre><code
              >{`{
  "id": "a3f1b8c2d4e56789ab01cd23",
  "createdAt": "2026-05-02T18:00:00.000Z",
  "expiresAt": "2026-05-03T18:00:00.000Z",
  "passwordRequired": false,
  "remainingDownloads": 4,
  "manifestCiphertext": "<base64url>",
  "manifestIv": "<base64url>",
  "salt": null,
  "ivWrap": null,
  "wrappedKey": null
}`}</code
            ></pre>
        </div>
        <p class="resp-codes">
          <span class="rc">404</span> Share nicht gefunden <span class="rc">410</span> abgelaufen oder
          Download-Limit erreicht
        </p>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method get">GET</span>
          <code class="ep-path">/api/v1/download/:id/blob/:n</code>
        </div>
        <p>
          Den n-ten verschlüsselten Blob streamen (<code>n</code> ist 1-basiert). Response:
          <code>application/octet-stream</code>.
        </p>
        <p class="resp-codes">
          <span class="rc">400</span> ungültiger Index <span class="rc">404</span> nicht gefunden
          <span class="rc">410</span> abgelaufen
        </p>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method get">GET</span>
          <code class="ep-path">/api/v1/r/:wordcode</code>
        </div>
        <p>Share-ID anhand des 4-Wort-Codes auflösen.</p>
        <div class="resp-block">
          <span class="resp-label">200</span>
          <pre><code>{'{'} "shareId": "a3f1b8c2d4e56789ab01cd23" {'}'}</code></pre>
        </div>
        <p class="resp-codes">
          <span class="rc">404</span> kein Share mit diesem Code <span class="rc">410</span> abgelaufen
        </p>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Authentifizierung</h2></div>
    <div class="panel-body prose">
      <p class="note">Nur verfügbar wenn <code>ENABLE_ACCOUNTS=true</code>.</p>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method post">POST</span>
          <code class="ep-path">/api/v1/auth/register</code>
          <span class="badge">3/10 min/IP</span>
        </div>
        <p>Neuen Account registrieren. Erste Registrierung erhält Admin-Rolle.</p>
        <pre class="code-block"><code
            >{`{ "email": "user@example.com", "password": "minimum8characters" }`}</code
          ></pre>
        <p class="resp-codes">
          <span class="rc ok">201</span> setzt <code>sid</code>-Cookie
          <span class="rc">400</span> Validierungsfehler
          <span class="rc">409</span> E-Mail bereits registriert
        </p>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method post">POST</span>
          <code class="ep-path">/api/v1/auth/login</code>
          <span class="badge">5/min/IP</span>
        </div>
        <p>
          Einloggen. Wenn 2FA aktiviert ist, zunächst nur mit Passwort senden — bei Antwort 202 dann
          erneut mit <code>totpCode</code>.
        </p>
        <pre class="code-block"><code
            >{`{ "email": "user@example.com", "password": "yourpassword", "totpCode": "123456" }`}</code
          ></pre>
        <p class="resp-codes">
          <span class="rc ok">200</span> setzt <code>sid</code>-Cookie
          <span class="rc">202</span> 2FA erforderlich
          <span class="rc">401</span> ungültige Zugangsdaten
        </p>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method post">POST</span>
          <code class="ep-path">/api/v1/auth/logout</code>
        </div>
        <p>Aktuelle Session invalidieren. Erfordert Authentifizierung.</p>
      </div>

      <div class="endpoint">
        <div class="ep-head">
          <span class="method get">GET</span>
          <code class="ep-path">/api/v1/auth/me</code>
        </div>
        <p>Aktuell authentifizierten Nutzer zurückgeben.</p>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Account</h2></div>
    <div class="panel-body prose">
      <p>Alle Account-Endpunkte erfordern Authentifizierung.</p>

      <div class="ep-list">
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/account/uploads</code><span
            >Eigene Shares + Quota-Nutzung</span
          >
        </div>
        <div class="ep-row">
          <span class="method del sm">DELETE</span><code>/api/v1/account/uploads/:id</code><span
            >Eigenen Share löschen</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/account/profile</code><span
            >Profil abrufen (Name, E-Mail)</span
          >
        </div>
        <div class="ep-row">
          <span class="method patch sm">PATCH</span><code>/api/v1/account/profile</code><span
            >Profil aktualisieren</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/account/security</code><span
            >Sicherheits-Infos (2FA-Status)</span
          >
        </div>
        <div class="ep-row">
          <span class="method post sm">POST</span><code>/api/v1/account/security/password</code
          ><span>Passwort ändern</span>
        </div>
        <div class="ep-row">
          <span class="method post sm">POST</span><code>/api/v1/account/security/2fa/setup</code
          ><span>2FA-Setup einleiten (TOTP-Secret)</span>
        </div>
        <div class="ep-row">
          <span class="method post sm">POST</span><code>/api/v1/account/security/2fa/verify</code
          ><span>2FA aktivieren (Code bestätigen)</span>
        </div>
        <div class="ep-row">
          <span class="method post sm">POST</span><code>/api/v1/account/security/2fa/disable</code
          ><span>2FA deaktivieren</span>
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/account/notifications</code><span
            >Benachrichtigungs-Einstellungen</span
          >
        </div>
        <div class="ep-row">
          <span class="method patch sm">PATCH</span><code>/api/v1/account/notifications</code><span
            >Benachrichtigungs-Einstellungen aktualisieren</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/account/tokens</code><span
            >API-Tokens auflisten</span
          >
        </div>
        <div class="ep-row">
          <span class="method post sm">POST</span><code>/api/v1/account/tokens</code><span
            >Neuen API-Token erstellen</span
          >
        </div>
        <div class="ep-row">
          <span class="method del sm">DELETE</span><code>/api/v1/account/tokens/:id</code><span
            >API-Token löschen</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/account/audit</code><span
            >Audit-Log des eigenen Accounts</span
          >
        </div>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Admin</h2></div>
    <div class="panel-body prose">
      <p>Alle Admin-Endpunkte erfordern die <code>admin</code>-Rolle.</p>

      <div class="ep-list">
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/admin/users</code><span
            >Alle Nutzer auflisten</span
          >
        </div>
        <div class="ep-row">
          <span class="method patch sm">PATCH</span><code>/api/v1/admin/users/:id</code><span
            >Nutzer-Quota oder Rolle ändern</span
          >
        </div>
        <div class="ep-row">
          <span class="method del sm">DELETE</span><code>/api/v1/admin/users/:id</code><span
            >Nutzer löschen</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/admin/shares</code><span
            >Alle Shares auflisten</span
          >
        </div>
        <div class="ep-row">
          <span class="method del sm">DELETE</span><code>/api/v1/admin/shares/:id</code><span
            >Share löschen</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/admin/audit</code><span
            >System-weites Audit-Log</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/admin/health</code><span
            >Detaillierter System-Gesundheitsstatus</span
          >
        </div>
        <div class="ep-row">
          <span class="method get sm">GET</span><code>/api/v1/admin/settings</code><span
            >System-Einstellungen abrufen</span
          >
        </div>
        <div class="ep-row">
          <span class="method patch sm">PATCH</span><code>/api/v1/admin/settings</code><span
            >System-Einstellungen aktualisieren</span
          >
        </div>
      </div>
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
  .lede code {
    font-family: var(--font-mono);
    font-size: 13px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .link {
    color: var(--brand);
    text-decoration: none;
  }
  .link:hover {
    text-decoration: underline;
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

  .auth-note {
    margin-bottom: 20px;
  }
  .auth-note .panel-body p {
    margin: 0 0 10px;
    font-size: 14px;
    color: var(--text);
    line-height: 1.6;
  }
  .auth-note .panel-body p:last-child {
    margin-bottom: 0;
  }
  .auth-note code {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .code-inline {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    overflow-x: auto;
    margin: 0;
  }
  .code-inline code {
    background: none;
    border: none;
    padding: 0;
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
  .prose code {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .note {
    background: color-mix(in srgb, var(--brand) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--brand) 20%, var(--border));
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    font-size: 13.5px;
    color: var(--text) !important;
    line-height: 1.55;
    margin-bottom: 20px !important;
  }
  .note code {
    font-family: var(--font-mono);
    font-size: 12px;
    background: color-mix(in srgb, var(--brand) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--brand) 20%, var(--border));
    border-radius: 4px;
    padding: 1px 5px;
  }

  /* Endpoints */
  .endpoint {
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
    margin-bottom: 24px;
  }
  .endpoint:last-child {
    border-bottom: none;
    padding-bottom: 0;
    margin-bottom: 0;
  }
  .ep-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .method {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: var(--font-mono);
    flex-shrink: 0;
  }
  .method.get {
    background: color-mix(in srgb, #22c55e 15%, var(--surface));
    color: #16a34a;
  }
  .method.post {
    background: color-mix(in srgb, var(--brand) 15%, var(--surface));
    color: var(--brand-strong);
  }
  .method.patch {
    background: color-mix(in srgb, #f59e0b 15%, var(--surface));
    color: #b45309;
  }
  .method.del {
    background: color-mix(in srgb, var(--danger) 15%, var(--surface));
    color: var(--danger);
  }
  :global([data-theme='dark']) .method.get {
    color: #4ade80;
  }
  :global([data-theme='dark']) .method.post {
    color: var(--brand);
  }
  :global([data-theme='dark']) .method.patch {
    color: #fbbf24;
  }
  .ep-path {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--text);
    font-weight: 600;
    background: none;
    border: none;
    padding: 0;
  }
  .badge {
    font-size: 11px;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9999px;
    padding: 2px 8px;
    font-weight: 500;
  }

  .resp-block {
    margin: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .resp-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 12px 0;
  }
  .resp-row .resp-block {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  .resp-label {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: #16a34a;
    letter-spacing: 0.03em;
  }
  .resp-label.err {
    color: var(--danger);
  }
  .resp-block pre {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--text);
  }
  .resp-block pre code {
    background: none;
    border: none;
    padding: 0;
  }
  .resp-codes {
    font-size: 13px;
    color: var(--muted);
    margin: 8px 0 0 !important;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .rc {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--danger);
    font-weight: 600;
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--danger) 20%, var(--border));
    border-radius: 4px;
    padding: 1px 6px;
  }
  .rc.ok {
    color: #16a34a;
    background: color-mix(in srgb, #22c55e 8%, var(--surface));
    border-color: color-mix(in srgb, #22c55e 20%, var(--border));
  }

  .code-block {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0 0 12px;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--text);
  }
  .code-block code {
    background: none;
    border: none;
    padding: 0;
  }

  /* Endpoint list (compact) */
  .ep-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ep-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--muted);
  }
  .ep-row:hover {
    background: var(--surface-2);
  }
  .ep-row code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text);
    flex: 0 0 auto;
  }
  .ep-row span:last-child {
    color: var(--muted);
    font-size: 13px;
  }
  .method.sm {
    font-size: 10px;
    padding: 2px 6px;
  }

  /* Table */
  .table-wrap {
    overflow-x: auto;
    margin-bottom: 12px;
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
