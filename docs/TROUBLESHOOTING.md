# Troubleshooting

Sammlung der Probleme, die während Entwicklung und Deployment aufgetaucht sind, jeweils mit **Symptom**, **Ursache** und **Fix**. Beim nächsten Auftauchen findet man hier zuerst.

Reihenfolge: nach Build-Pipeline-Phase (Build → Runtime → Network).

---

## 1. Native Module (better-sqlite3) bricht beim Image-Build ab

**Symptom**
Während `pnpm install` im Builder-Stage:

```
gyp ERR! find Python Python is not set ...
prebuild-install warn install No prebuilt binaries found
```

**Ursache**
`better-sqlite3` enthält native Bindings, die mit `node-gyp` kompiliert werden, falls kein passendes prebuild verfügbar ist. `node:22-alpine` bringt keine Build-Tools mit.

**Fix**
Im Builder-Stage des Dockerfiles vor dem Install installieren:

```dockerfile
RUN apk add --no-cache python3 make g++
```

---

## 2. TypeScript-Stripping in `node_modules` schlägt im Runtime-Stage fehl

**Symptom**
Container startet nicht. Fehler aus Node.js:

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]:
Stripping types is currently unsupported for files under node_modules,
for ".../node_modules/@itsweber-send/shared/src/index.ts"
```

**Ursache**
`pnpm deploy` kopiert Workspace-Pakete (z. B. `@itsweber-send/shared`) in die Deploy-Struktur. Das Paket exportierte aber `.ts`-Quellen direkt:

```json
"main": "src/index.ts",
"exports": { ".": "./src/index.ts" }
```

Node.js 22 stripped TypeScript zur Laufzeit nur außerhalb von `node_modules`.

**Fix**

1. Build-Step für das Shared-Paket: `tsconfig.build.json` mit `outDir: "dist"` und `module: "NodeNext"`.
2. Conditional Exports in `package.json`:

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "import": "./dist/index.js"
  }
}
```

3. `"build": "tsc -p tsconfig.build.json"` im Scripts-Block — Turborepo läuft das automatisch vor `api#build` weil `dependsOn: ["^build"]`.

---

## 3. Frontend lieferte 404 obwohl SvelteKit-Build im Image lag

**Symptom**
`GET /` antwortet mit Fastify-JSON `{"message":"Route GET:/ not found","statusCode":404}`. Nur `/health` und `/api/v1/*` funktionieren.

**Ursache**
Container startet nur den Fastify-API-Server (`node apps/api/build/server.js`). Der SvelteKit-Build wird zwar in `/app/apps/web/build` kopiert, aber niemand liefert ihn aus.

**Fix**
SvelteKit-Adapter-Node-Handler als Fastify-`setNotFoundHandler` einhängen — Fastify-Routen gewinnen zuerst, alles andere fällt an SvelteKit durch:

```typescript
if (config.env === 'production') {
  const handlerPath = resolve(here, '../../web/build/handler.js');
  const mod = await import(handlerPath);
  app.setNotFoundHandler((request, reply) => {
    reply.hijack(); // Fastify nicht selbst antworten lassen
    return new Promise((res, rej) => {
      mod.handler(request.raw, reply.raw, (err) => (err ? rej(err) : res()));
    });
  });
}
```

`reply.hijack()` muss **vor** dem Handler-Aufruf passieren, sonst versucht Fastify nach SvelteKits Antwort selbst zu schließen.

`@fastify/middie`-Variante (`app.use(handler)`) funktioniert **nicht**: middie läuft vor allen Fastify-Routen, der SvelteKit-Handler fängt dann auch `/health` und `/api/*` ab und liefert sein eigenes 404-HTML.

---

## 4. svelte-i18n crasht erste Render-Runde — leere Seite

**Symptom**
Leeres Browser-Fenster, in der Console:

```
[svelte-i18n] Cannot format a message without first setting the initial locale
```

Stack-Trace zeigt `formatMessage` aus dem ersten `$_('label')` der gerendert wird.

**Ursache**
Lazy-Bundle-Loading via `register('de', () => import('./de.json'))` ist asynchron. `init()` setzt `$locale`, aber das Bundle ist beim ersten Render noch nicht geladen.

**Fix**
Synchronen Import nutzen, JSON-Bundles inline mitbauen:

```typescript
import deMessages from './de.json';
import enMessages from './en.json';

addMessages('de', deMessages);
addMessages('en', enMessages);
init({ fallbackLocale: 'de', initialLocale: ... });
```

Die Bundles sind ~2 KB pro Sprache — das spart eine Round-Trip-Round für nichts.

Zusätzlich: Globaler `+layout.ts` mit `export const ssr = false` weil die App reine Client-Side-Crypto macht und SSR nichts bringt außer i18n-Race-Conditions zur Server-Render-Zeit.

---

## 5. CSP blockiert Inline-Theme-Script

**Symptom**
Console:

```
Executing inline script violates CSP directive: 'script-src 'self' 'nonce-...''.
```

Inline-Script in `app.html` für `<html data-theme="…">`-Vorbelegung wird verworfen.

**Ursache**
SvelteKits CSP-Mode `auto` generiert pro Render einen Nonce, der allen SvelteKit-eigenen Scripts mitgegeben wird. Manuell in `app.html` eingefügte Inline-Scripts haben keinen Nonce → werden blockiert.

**Fix**
Script in eine Static-Datei auslagern:

```html
<!-- src/app.html -->
<script src="%sveltekit.assets%/theme-init.js"></script>
```

```js
// static/theme-init.js
try {
  var stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    document.documentElement.dataset.theme = stored;
  }
} catch (_) {
  /* localStorage may be unavailable */
}
```

`script-src: 'self'` erlaubt Same-Origin-Files automatisch — keine `unsafe-inline`-Lockerung nötig, kein Nonce-Hash-Kuddelmuddel.

---

## 6. Upload schlägt mit „Cannot read properties of undefined (reading 'generateKey')" fehl

**Symptom**
UI rendert korrekt, aber sobald „Verschlüsseln & hochladen" geklickt wird:

```
Fehler beim Upload
Cannot read properties of undefined (reading 'generateKey')
```

**Ursache**
`window.crypto.subtle` ist nur in **Secure Contexts** verfügbar (HTTPS, `localhost`, `127.0.0.1`). Über `http://192.168.0.10:3456` (LAN-IP, kein TLS) gibt der Browser `crypto.subtle === undefined` zurück. Das ist eine harte Browser-Policy, nichts was die App reparieren kann.

**Fix**
Reverse-Proxy mit TLS davor schalten. Für LAN/Home-Lab-Tests: `docker/Caddyfile.lan` + `docker/docker-compose.lan.yml` — Caddy generiert per `tls internal` ein selbst-signiertes Cert via lokaler CA. User akzeptiert die Cert-Warnung einmal pro Browser-Session.

Production: `docker/Caddyfile.example` mit echtem Hostname + Let's Encrypt.

---

## 7. ERR_SSL_PROTOCOL_ERROR / „TLS alert internal error" bei Caddy mit IP-Adresse

**Symptom**
Browser zeigt `ERR_SSL_PROTOCOL_ERROR` beim Aufruf von `https://192.168.0.10:8443/`. `curl -k` schlägt fehl mit `tlsv1 alert internal error` (alert 80). `openssl s_client -servername 192.168.0.10` funktioniert dagegen.

**Ursache**
RFC 6066 verbietet IP-Literals als SNI-Wert. Curl (und einige Browser/Sicherheits-Configs) senden bei `https://<IP>:<port>` daher **gar keine** SNI-Extension. Caddy hat aber mehrere Sites konfiguriert (`192.168.0.10:8443, localhost:8443, 127.0.0.1:8443`) und kann ohne SNI keine wählen → Handshake-Abbruch.

**Fix**
Im globalen Block der Caddyfile:

```
{
    local_certs
    default_sni 192.168.0.10
}
```

Bei fehlender SNI behandelt Caddy die Verbindung dann so, als wäre sie für `192.168.0.10` — das passende Cert wird ausgeliefert.

---

## 8. Rate-Limit greift hinter Caddy nicht — `X-RateLimit-Remaining` bleibt konstant

**Symptom**
Login-Endpoint hat `max: 5, timeWindow: '1 minute'`, aber 30 Aufrufe vom selben Host bekommen weiter `401`. Im Header-Dump zeigt jeder Versuch `X-RateLimit-Remaining: 4`.

**Ursache**
Im Caddyfile war `header_up X-Forwarded-For {remote}` gesetzt. Caddy 2 expandiert `{remote}` zu `address:port`, also z. B. `172.19.0.1:42090`. Der Port ändert sich pro TCP-Verbindung, Fastifys `request.ip` (mit `trustProxy`) übernimmt den linkesten X-Forwarded-For-Wert — und damit ist der Rate-Limit-Schlüssel pro Request unterschiedlich.

**Fix**

- `header_up X-Forwarded-For {remote}` weglassen — Caddy setzt den Header bereits korrekt mit reiner IP.
- Falls `X-Real-IP` o. Ä. gewünscht: `{remote_host}` statt `{remote}` verwenden.

```caddy
reverse_proxy send:3000 {
    header_up X-Real-IP {remote_host}
}
```

---

## 9. Container-Start mit `read_only: true` schlägt fehl

**Symptom**
Beim Hochfahren mit Härtung (`docker-compose.yml`):

```
EROFS: read-only file system, mkdir '/app/...'
```

**Ursache**
Node-Prozesse oder Multipart-Parser möchten temporäre Dateien anlegen. Bei `read_only: true` ist nur das gemountete Volume schreibbar.

**Fix**

- Compose-Block:

```yaml
read_only: true
tmpfs:
  - /tmp:size=64m,mode=1777
volumes:
  - send-data:/data
```

- Storage und SQLite explizit unter `/data` verorten (`STORAGE_PATH`, `DB_PATH`).
- Multipart in der Upload-Route nicht auf Disk spillen lassen — wir verwenden `part.toBuffer()`, daher kein `/tmp`-Bedarf für Uploads selbst.

---

## Handhabe

Beim Hinzufügen eines neuen Eintrags: knappes Symptom (was sieht der Entwickler in Logs/UI), präzise Ursache (warum, nicht bloß was), und konkreter Fix (Code-Snippet oder Link auf Datei). Keine Lehrbuch-Erklärungen — wer das hier liest, braucht die Lösung.
