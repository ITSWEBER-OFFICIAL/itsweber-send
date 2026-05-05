# Mobile UX Audit — v1.1 (Block H)

Stand: 2026-05-03 · Bezugsversion: `1.1.0` · Reviewer: lokaler Sweep gegen iOS Safari, Android Chrome, kleine Tablets (iPad Mini)

Dieser Audit prüft alle kritischen Flows auf Touch-, Form- und Viewport-Verhalten unter Mobilbedingungen. Er dokumentiert Fundstellen, die in v1.1 noch nicht ideal waren, sowie die in dieser Iteration angewendeten Korrekturen.

## Audit-Kriterien

| Bereich                | Mindestanspruch                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Touch-Target-Größe     | ≥ 44 × 44 px (WCAG 2.5.5 / Apple HIG)                                                |
| Form-Input-Schriftgrad | ≥ 16 px auf Touch-Geräten (sonst zoomt iOS Safari beim Fokus)                        |
| Viewport-Höhe          | `100dvh` als Primärwert, `100vh` als Fallback                                        |
| Safe-Area-Insets       | `viewport-fit=cover` aktiv → Sticky-Header und Bottom-Aktionen müssen `env()` nutzen |
| Sticky-Header          | Nicht überlappend mit Inhalt; Nav-Reihenfolge mobil-tauglich                         |
| Drop-Zone              | Funktioniert mit Touch-Tap auf "Dateien auswählen", nicht auf Drag-only              |

## Fundstellen + Korrekturen

### 1. Touch-Target-Größen (Touch-Targets)

**Vorher:** `.file-actions button` (Pause / Resume / X-Entfernen je Dateizeile) waren `28 × 28 px`.

**Korrektur:** Default auf `36 × 36 px`, mobile Breakpoint (`≤ 640 px`) auf `44 × 44 px`. Damit erfüllen die wichtigsten interaktiven Steuerungen während des Uploads die WCAG-Mindestgröße.

`.chip` (Expiry / Download-Limit-Auswahl) hatte mobil `~30 px` Höhe → Korrektur: `min-height: 44px` und `padding: 8px 14px` ab `640 px`.

### 2. iOS-Zoom auf Form-Inputs

**Vorher:** `.input`, `.password-input` und das Empfangs-Eingabefeld auf `/r` standen auf `font-size: 14px`. iOS Safari zoomt bei Fokus zu jedem Input mit Schriftgrad `< 16 px`. Resultat: Kontextverlust im Layout.

**Korrektur:** Globale Media-Query in `app.css`:

```css
@media (max-width: 640px) {
  .input,
  input[type='text'],
  input[type='password'],
  input[type='email'],
  input[type='search'],
  textarea {
    font-size: 16px;
  }
}
```

Diese Regel wirkt zusätzlich auf das Passwort-Eingabefeld auf `/d/[id]` (eigene Klasse `.password-input`, vom `input[type='password']`-Selektor erfasst).

### 3. Viewport-Höhe (100vh-Bug auf iOS)

**Vorher:** `body { min-height: 100vh; }` → unter iOS Safari ist `100vh` größer als der sichtbare Viewport, weil URL-Bar/Tabs nicht eingerechnet werden. Resultat: Hintergrund-Gradient wird abgeschnitten oder erzeugt vertikalen Overscroll.

**Korrektur:** Zusätzlich `min-height: 100dvh` als zweiter, dynamischer Wert. Browser, die `dvh` nicht kennen (älteres Chrome < 108 / Safari < 15.4), fallen automatisch auf den `100vh`-Wert zurück.

### 4. Safe-Area-Insets (iPhone Notch / Android Cutout)

**Vorher:** `app.html` hatte korrekt `viewport-fit=cover`, aber das `.appbar`-Padding verwendete `12px 28px` ohne `env(safe-area-inset-*)`. Auf einem iPhone 14+ landete der Brand-Mark teilweise unter dem Dynamic Island.

**Korrektur:** `.appbar` nutzt jetzt `padding: max(12px, env(safe-area-inset-top, 0px)) max(28px, env(safe-area-inset-right, 0px)) 12px max(28px, env(safe-area-inset-left, 0px))`. Auf Geräten ohne Notch verhält sich das identisch zum vorherigen Wert (Fallback `0px`).

Der Mobile-Breakpoint (`≤ 880 px`) erbt die gleiche Logik mit kleineren Basis-Paddings (`10px` / `16px`).

### 5. Geprüft, kein Handlungsbedarf

| Element                                                    | Befund                                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Drop-Zone `<div role="button">` mit `onclick={openPicker}` | Tap auf den gesamten Bereich öffnet den Datei-Picker. Drag-Ereignisse werden auf Touch nicht ausgelöst — Klick-Pfad genügt. |
| `.btn-primary` (Hauptaktion "Verschlüsseln & hochladen")   | `min-height: 48px` auf `/d/[id]` und `min-height: 44px` auf `.btn-download` — bereits compliant.                            |
| Sticky-Header                                              | Auf `≤ 880 px` umbrechende Grid-Layout-Variante in `+layout.svelte` — Brand + Tools in Reihe 1, Nav in Reihe 2. Korrekt.    |
| Theme-Toggle / Language-Pill                               | Beide Pills nutzen Padding `6px 12px` → effektiv ~32 px. Akzeptabel im Header-Kontext, da neben gut sichtbarer Brand.       |
| Result-Panel (`.share-grid`, `.voice-grid`)                | Ab `≤ 700 px` auf einspaltig — getestet, keine Überlappung.                                                                 |
| `.qr` Canvas                                               | Fest 176 × 176 px, im Result-Panel zentriert auf Mobile. Kein Skalierungsproblem.                                           |
| `/r` Eingabe                                               | Stack-Layout `≤ 480 px` (Input über Button) — funktional. Die globale `font-size: 16px`-Regel deckt iOS-Zoom ab.            |

## Test-Matrix

Manuell verifiziert über die Browser-Devtools-Geräteemulation:

- iPhone 14 Pro (390 × 844, DPR 3, Notch-Profil)
- iPhone SE 3 (375 × 667, kein Notch — Fallback-Pfad)
- Pixel 7 (412 × 915, Android Chrome)
- iPad Mini (768 × 1024, viewport-fit-Edge-Case bei großem Bildschirm + safe-area)

Tatsächliches Geräte-Smoke-Testing erfolgt im Rahmen der Deployment-Verifikation auf Zielhardware vor jedem Release.

## Nicht-Ziele dieses Audits

- Keine PWA-Share-Target-Implementierung (separate Roadmap-Position M7).
- Keine native iOS / Android-App.
- Keine Geste / Long-Press-Aktionen — die Drop-Zone bleibt drag-or-tap.
