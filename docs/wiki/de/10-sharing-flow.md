# Sharing-Flow

> [English](../10-sharing-flow.md)

Diese Seite erklärt genau, was beim Upload passiert und wie die drei Sharing-Methoden zusammenhängen.

---

## End-to-End-Modell

1. Der Browser erzeugt einen 256-Bit `master_key` mit `crypto.getRandomValues`.
2. Jeder Datei-Blob wird einzeln mit **AES-256-GCM** verschlüsselt (96-Bit-IV, 128-Bit Auth-Tag).
3. Das Manifest (Dateinamen, Größen, MIME-Typen) wird mit demselben Schlüssel verschlüsselt.
4. Der gesamte Ciphertext wird hochgeladen. Der Server speichert opake Bytes und sieht weder Schlüssel noch Dateinamen.
5. Der Browser erzeugt drei Artefakte, die der Empfänger nutzen kann:

| Artefakt                          | Trägt den Schlüssel? | Anmerkung                                             |
| --------------------------------- | -------------------- | ----------------------------------------------------- |
| **Sharing-Link** (URL mit `#k=…`) | Ja                   | Vollständig. Fragment wird nie zum Server übertragen. |
| **4-Wort-Code**                   | Nein (nur ~32 Bit)   | Lookup-Token. SHA-256-Hash der Share-ID.              |
| **Passwort** (optional)           | Abgeleitet           | PBKDF2-SHA-256 umwickelt den Schlüssel client-seitig. |

Die Invariante: **jedes Artefakt, das entschlüsseln können soll, muss den Schlüssel direkt oder indirekt tragen.** Ein 4-Wort-Code allein kann das nicht.

---

## Drei Sharing-Modi

### Modus 1 — Vollständiger Link

Du sendest die lange URL (`https://host/d/<id>#k=<base64url>`). Der Empfänger fügt sie in die Adresszeile ein; der Browser entschlüsselt direkt.

Geeignet für: Chat, E-Mail, alles was die URL exakt erhält.

### Modus 2 — Sprache / Diktat (empfohlen für Telefon)

Beim Upload **Passwort** und **4-Wort-Code** beide aktivieren. Das Result-Panel gruppiert sie in einer "Per Sprache teilen"-Box. Du diktierst:

```
Code:     messer-asche-sahne-buch
Passwort: Sonne42
```

Der Empfänger öffnet die **Empfangen**-Seite, tippt den Code ein und wird zur Download-Seite weitergeleitet. Da ein Passwort gesetzt ist, fragt sie nach dem Passwort — der Empfänger gibt `Sonne42` ein, der Share entschlüsselt.

Dieser Modus ist vollständig per Stimme nutzbar. Es ist die einzige Möglichkeit, den 4-Wort-Code als eigenständige Capability zu verwenden.

### Modus 3 — Code als Lookup, Link zur Entschlüsselung

4-Wort-Code aktiviert, kein Passwort. Das Result-Panel kennzeichnet den Code als "nur Lookup". Du sendest den Code über einen Kanal (Chat) und den vollständigen Link über einen anderen (Signal). Empfänger können beides nutzen: der Code findet den Share, der Link entschlüsselt ihn. Der Code ist hier ein Hilfsmittel, keine eigene Capability.

---

## Empfangs-Flow

Die **Empfangen**-Seite akzeptiert:

1. Eine vollständige URL mit `#k=…` -> öffnet `/d/<id>#k=…` direkt.
2. Eine 24-stellige Hex-Share-ID -> öffnet `/d/<id>` (Empfänger braucht weiterhin den Schlüssel).
3. Einen 4-Wort-Code -> ruft `GET /api/v1/r/<wordcode>` auf, holt die Share-ID, leitet auf `/d/<id>` weiter.

Bei passwortgeschützten Shares zeigt die Download-Seite eine Passwort-Eingabe. Das Passwort läuft durch PBKDF2-SHA-256 (200 000 Iterationen) mit dem Salt des Shares, um den Master-Key auszupacken. Bei falscher Eingabe fragt die Seite erneut; der Server sieht nur Ciphertext-Versuche.

Bei nicht passwortgeschützten Shares ohne `#k=…` zeigt die Seite den Hinweis, beim Absender Passwort oder vollständige URL anzufragen — der Share kann nicht aus der Share-ID allein entschlüsselt werden.

---

## Warum 4 Wörter zum Finden reichen, aber nicht zum Entschlüsseln

Vier Wörter aus einer 255-Wort-Liste tragen:

```
4 * log2(255) = 4 * 7,99 = ~32 Bit
```

Das genügt für `2^32 = ~4 Milliarden` Codes — kollisionssicher in jedem realistischen Setup, aber **viel zu wenig** für einen 256-Bit-AES-Schlüssel. Um einen Schlüssel zu codieren bräuchte man:

```
ceil(256 / log2(W)) Wörter
W = 255   ->  ~33 Wörter
W = 2048  ->  24 Wörter (BIP-39 / Hardware-Wallets)
```

Alles zwischen 4 und 6 Wörtern ist konzeptionell ein Lookup-Token, kein Schlüssel. Der 4-Wort-Code ist deshalb bewusst so eng gefasst: kurz, merkbar, diktierbar — gepaart mit einem Passwort wird daraus eine vollwertige Capability.
