<div class="doc-page">
  <div class="page-hero">
    <h1>Konfiguration</h1>
    <p class="lede">
      Alle Einstellungen werden über Umgebungsvariablen gesetzt. Für Entwicklung sind die Defaults
      ausreichend — in der Produktion mindestens <code>BASE_URL</code> und
      <code>NODE_ENV=production</code> setzen.
    </p>
  </div>

  <section class="panel">
    <div class="panel-h"><h2>Server</h2></div>
    <div class="panel-body">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Beschreibung</th></tr></thead>
          <tbody>
            <tr>
              <td><code>NODE_ENV</code></td>
              <td><code>development</code></td>
              <td
                >Auf <code>production</code> setzen. Aktiviert HTTPS-only-Cookies, deaktiviert
                Dev-CORS, setzt <code>upgrade-insecure-requests</code> in der CSP.</td
              >
            </tr>
            <tr>
              <td><code>HOST</code></td>
              <td><code>127.0.0.1</code></td>
              <td
                >Interface, an das Fastify bindet. Im Container ohne lokalen Reverse-Proxy auf <code
                  >0.0.0.0</code
                > setzen.</td
              >
            </tr>
            <tr>
              <td><code>PORT</code></td>
              <td><code>3000</code></td>
              <td>TCP-Port der Anwendung.</td>
            </tr>
            <tr>
              <td><code>BASE_URL</code></td>
              <td><code>http://localhost:3000</code></td>
              <td
                >Öffentlich erreichbare URL des Dienstes inkl. Schema. Wird für Share-Links und
                Cookie-Attribute verwendet. Kein abschließender Slash.</td
              >
            </tr>
            <tr>
              <td><code>LOG_LEVEL</code></td>
              <td><code>info</code></td>
              <td
                >Pino-Log-Level: <code>fatal</code>, <code>error</code>, <code>warn</code>,
                <code>info</code>, <code>debug</code>, <code>trace</code>.</td
              >
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Speicher</h2></div>
    <div class="panel-body">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Beschreibung</th></tr></thead>
          <tbody>
            <tr>
              <td><code>STORAGE_BACKEND</code></td>
              <td><code>filesystem</code></td>
              <td
                >Speicher-Adapter für Blobs. <code>filesystem</code> speichert als Dateien.
                <code>s3</code> für S3/MinIO.</td
              >
            </tr>
            <tr>
              <td><code>STORAGE_PATH</code></td>
              <td><code>./data/uploads</code></td>
              <td
                >Verzeichnis für Filesystem-Backend. Muss beschreibbar sein. Im Container: <code
                  >/data/uploads</code
                >.</td
              >
            </tr>
            <tr>
              <td><code>DB_PATH</code></td>
              <td><code>./data/shares.db</code></td>
              <td>Pfad zur SQLite-Datenbankdatei. Muss beschreibbar sein.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Rate-Limiting</h2></div>
    <div class="panel-body">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Beschreibung</th></tr></thead>
          <tbody>
            <tr>
              <td><code>RATE_LIMIT_PER_MIN</code></td>
              <td><code>60</code></td>
              <td
                >Globales IP-Limit pro Minute. Login (5/min) und Registrierung (3/10 min) haben
                separate, strengere Limits.</td
              >
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Accounts</h2></div>
    <div class="panel-body">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Beschreibung</th></tr></thead>
          <tbody>
            <tr>
              <td><code>ENABLE_ACCOUNTS</code></td>
              <td><code>true</code></td>
              <td
                >Nutzerregistrierung und Login erlauben. Bei <code>false</code> sind Auth-Routen nicht
                erreichbar und Uploads immer anonym.</td
              >
            </tr>
            <tr>
              <td><code>REGISTRATION_ENABLED</code></td>
              <td><code>true</code></td>
              <td
                >Neue Account-Registrierungen erlauben. Auf <code>false</code> setzen, nachdem der initiale
                Admin eingerichtet ist.</td
              >
            </tr>
            <tr>
              <td><code>SESSION_EXPIRY_DAYS</code></td>
              <td><code>30</code></td>
              <td>Lebensdauer eines Session-Cookies in Tagen.</td>
            </tr>
            <tr>
              <td><code>DEFAULT_QUOTA_BYTES</code></td>
              <td><code>5368709120</code></td>
              <td>Upload-Quota pro Nutzer in Bytes (Default: 5 GB). Gilt für neue Accounts.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>S3 / MinIO</h2></div>
    <div class="panel-body">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Beschreibung</th></tr></thead>
          <tbody>
            <tr>
              <td><code>S3_BUCKET</code></td>
              <td><em>erforderlich</em></td>
              <td
                >Name des S3- oder MinIO-Buckets für Blob-Speicher. Nur bei <code
                  >STORAGE_BACKEND=s3</code
                >.</td
              >
            </tr>
            <tr>
              <td><code>S3_ENDPOINT</code></td>
              <td><em>leer</em></td>
              <td
                >Custom-Endpoint für MinIO oder andere S3-kompatible Dienste (z. B. <code
                  >http://minio:9000</code
                >). Leer lassen für AWS.</td
              >
            </tr>
            <tr>
              <td><code>S3_REGION</code></td>
              <td><code>us-east-1</code></td>
              <td>AWS- oder MinIO-Region.</td>
            </tr>
            <tr>
              <td><code>S3_FORCE_PATH_STYLE</code></td>
              <td><code>false</code></td>
              <td
                >Auf <code>true</code> setzen bei MinIO oder anderen Path-Style-S3-Implementierungen.</td
              >
            </tr>
            <tr>
              <td><code>AWS_ACCESS_KEY_ID</code></td>
              <td><em>aus Umgebung</em></td>
              <td>S3/MinIO Access-Key. Das AWS SDK liest diese Standard-Env-Var automatisch.</td>
            </tr>
            <tr>
              <td><code>AWS_SECRET_ACCESS_KEY</code></td>
              <td><em>aus Umgebung</em></td>
              <td>S3/MinIO Secret-Key.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Webhooks</h2></div>
    <div class="panel-body prose">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Beschreibung</th></tr></thead>
          <tbody>
            <tr>
              <td><code>WEBHOOK_URL</code></td>
              <td><em>leer</em></td>
              <td>HTTP(S)-Endpoint für Webhook-Events. Leer lassen um Webhooks zu deaktivieren.</td>
            </tr>
            <tr>
              <td><code>WEBHOOK_SECRET</code></td>
              <td><em>leer</em></td>
              <td
                >Optionaler HMAC-SHA256-Signing-Secret. Wenn gesetzt, enthält jeder Request einen <code
                  >X-Webhook-Signature: sha256=&lt;hex&gt;</code
                >-Header.</td
              >
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Webhook-Events: <code>upload.created</code>, <code>download.completed</code>. Jeder
        Request-Body ist ein JSON-Objekt mit einem <code>timestamp</code>-Feld (ISO 8601). Einmalige
        Zustellung mit einem Retry bei Fehler. Die Anwendung blockiert die HTTP-Antwort nicht auf
        Webhook-Delivery.
      </p>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h2>Beispiel .env</h2></div>
    <div class="panel-body">
      <pre class="code-block"><code
          >NODE_ENV=production
BASE_URL=https://send.example.com
LOG_LEVEL=info

STORAGE_BACKEND=filesystem
STORAGE_PATH=/data/uploads
DB_PATH=/data/shares.db

RATE_LIMIT_PER_MIN=60

ENABLE_ACCOUNTS=true
REGISTRATION_ENABLED=true
SESSION_EXPIRY_DAYS=30
DEFAULT_QUOTA_BYTES=5368709120</code
        ></pre>
      <p class="hint">
        An docker compose übergeben: <code>docker compose --env-file .env up -d</code>
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
  .lede code {
    font-family: var(--font-mono);
    font-size: 13px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
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
    vertical-align: top;
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
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 4px;
    white-space: nowrap;
  }
  td:first-child {
    white-space: nowrap;
  }

  /* Code block */
  .code-block {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    overflow-x: auto;
    margin: 0 0 14px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.65;
    color: var(--text);
  }
  .code-block code {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
  }

  .hint {
    margin: 0;
    font-size: 13px;
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

  .prose p {
    margin: 0 0 12px;
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
    padding: 1px 4px;
  }
</style>
