# Konto &amp; Zwei-Faktor-Authentifizierung

> [English](../11-account-and-2fa.md)

Konten sind optional. Anonyme Uploads funktionieren ohne Registrierung. Ein Konto ergänzt Upload-Historie, Quota, API-Tokens, Audit-Log und 2FA.

---

## Registrierung &amp; erster Admin

Der erste registrierte Nutzer auf einem frischen Deployment erhält automatisch die `admin`-Rolle. Danach kann der Admin:

- `REGISTRATION_ENABLED` umschalten, um neue Registrierungen zu sperren
- Nutzer im Admin-Panel hoch-/herabstufen
- System-weite Audit-Logs einsehen

Um das Deployment nach dem Onboarding zu sichern: `REGISTRATION_ENABLED=false` setzen und Container neu starten.

---

## Konto-Seiten

Nach dem Login hat das **Konto**-Menü neun Unterseiten:

| Seite                | Zweck                                                       |
| -------------------- | ----------------------------------------------------------- |
| `Übersicht`          | Quota-Auslastung, letzte Shares, Quick-Actions              |
| `Uploads`            | Vollständige Liste der eigenen Shares; löschen oder ansehen |
| `API-Tokens`         | API-Tokens erstellen, listen, widerrufen (siehe unten)      |
| `Profil`             | Anzeigename, E-Mail                                         |
| `Sicherheit`         | Passwort ändern, 2FA einrichten                             |
| `Benachrichtigungen` | E-Mail-Benachrichtigungen bei Download / Ablauf             |
| `Sprache`            | UI-Sprache                                                  |
| `Theme`              | Hell / Dunkel / System                                      |
| `Audit-Log`          | Alle Aktionen am Konto mit Zeitstempel                      |

---

## API-Tokens

Tokens authentifizieren Maschine-zu-Maschine-Aufrufe ohne Session-Cookie.

### Erstellen

`Konto -> API-Tokens -> Neuer Token`. Namen vergeben (z. B. `CI-Pipeline`) und optional ein Ablaufdatum. Der Token wird **nur einmal** angezeigt — sofort kopieren. Nach dem Schließen sind nur noch Name und Metadaten sichtbar.

### Verwenden

Token im `Authorization`-Header übergeben:

```bash
curl -H "Authorization: Bearer <token>" \
     -F meta='...' \
     -F manifest=@manifest.bin \
     -F blob-0001=@blob1.bin \
     https://send.example.com/api/v1/upload
```

### Widerrufen

`Konto -> API-Tokens` -> Mülleimer-Symbol. Effekt sofort; jeder Client mit dem Token erhält dann `401 Unauthorized`.

### Scope

Ein Token erbt die Rolle des Erstellers. Admin-Tokens können Admin-Endpunkte aufrufen, User-Tokens nicht. Tokens zählen gegen dieselbe Quota wie der Nutzer. Im Audit-Log wird `auth.method = token` vermerkt — Token-Nutzung ist nachvollziehbar.

---

## Zwei-Faktor (TOTP)

ITSWEBER Send implementiert RFC 6238 TOTP mit HMAC-SHA1 und 30-Sekunden-Fenster. Keine externen Abhängigkeiten.

### Einrichtung

1. `Konto -> Sicherheit -> 2FA aktivieren`
2. Die Seite zeigt einen QR-Code und einen Base32-Secret
3. QR-Code mit einer Authenticator-App scannen (Aegis, 1Password, Authy, Google Authenticator, ...) oder Base32 manuell einfügen
4. Aktuellen 6-stelligen Code eingeben -> Server verifiziert und aktiviert 2FA

### Login-Flow mit 2FA

1. POST `/api/v1/auth/login` mit E-Mail + Passwort
2. Server antwortet `202 { requires2FA: true }`
3. Login-Seite zeigt jetzt eine 6-stellige Eingabe
4. POST `/api/v1/auth/login` erneut mit E-Mail + Passwort + `totpCode`
5. Bei Erfolg: `200` und Cookie `sid` gesetzt

Eine Clock-Skew-Toleranz von ±1 Schritt (±30 s) wird akzeptiert. Driftet die Uhr weiter, schlagen Codes fehl — dann lässt sich 2FA von der Sicherheits-Seite deaktivieren (sofern noch eine Session aktiv ist), sonst muss der Admin das Feld zurücksetzen.

### Deaktivieren

`Konto -> Sicherheit -> 2FA deaktivieren`. Erfordert Re-Authentifizierung per Passwort. Löscht `totp_secret` aus der Datenbank.

### Wiederherstellung

In v1.0 gibt es keine Recovery-Codes. Wer Authenticator und aktive Session verliert, braucht einen Admin, der `users.totp_enabled` und `users.totp_secret` per SQLite zurücksetzt. Recovery-Codes sind für v1.1 geplant.
