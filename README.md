# QR Scanner Client (React + Vite)

Ein React/Vite-Frontend zum Scannen von QR-/Barcodes im Browser. Es nutzt zwei interne Bibliotheken:

- `qr-scanner-library` — Kamerazugriff und Decoding-Loop (TypeScript, jsQR)
- `remote-debug-screenshot` — schwebender Button für Debug-Screenshots

Der Client unterstützt Kameraauswahl, kontinuierliches Scannen (kein Auto-Stop) und UI-CTAs im Stil von „openerp-scanner“.

## Voraussetzungen

- Node.js ≥ 18
- Moderne Browser mit MediaDevices API (getUserMedia)

## Install & Start (Registry-Versionen)

```bash
# Abhängigkeiten installieren
npm install

# Dev-Server starten (mit HTTPS-Host-Einstellungen aus Vite-Script)
npm run dev
```

## Lokale Entwicklung mit den Bibliotheken (npm link)

Wenn du die Bibliotheken im Monorepo lokal entwickeln willst, ohne sie ständig zu veröffentlichen, nutze `npm link`.

1) In jeder Bibliothek bauen und verlinken:

```bash
# Im Ordner: ../qr-scanner-library
npm install
npm run link:pkg     # baut und npm link

# Im Ordner: ../remote-debug-screenshot
npm install
npm run link:pkg     # baut und npm link
```

2) Im Client verlinken und starten:

```bash
# Im Ordner: ./qr-scanner-client
npm install
npm run link:dev     # npm link qr-scanner-library && npm link remote-debug-screenshot
npm run dev
```

3) Zurück zur Registry-Version (z. B. für CI/Deployment):

```bash
# Im Ordner: ./qr-scanner-client
npm run unlink:dev   # entfernt Links und installiert Registry-Versionen
```

Hinweis: Nach Änderungen an den Bibliotheken genügt i. d. R. ein erneuter Build (oder Watch). Der Symlink verweist weiterhin auf den gleichen Paketordner – ein erneutes "link" ist nicht nötig. Der Dev-Server sollte Änderungen automatisch erkennen, ggf. neu starten.

## Deployment-Hinweise

- In `package.json` sind die Bibliotheken auf Registry-Semver gesetzt (z. B. `^1.0.0`).
- Für CI/Deployment keine Links verwenden – einfach `npm ci` und `npm run build`.
- Möchtest du lokal beim `npm install` automatisch linken, kannst du optional ein `postinstall` mit Env-Flag einrichten (nicht empfohlen für CI):

```json
{
  "scripts": {
    "postinstall": "node -e \"if (process.env.LINK_LOCAL) { require('child_process').execSync('npm run link:dev', {stdio:'inherit'}); }\""
  }
}
```

Nutzung lokal:

```powershell
$env:LINK_LOCAL=1; npm install
```

## Nützliche Skripte

- `npm run dev` — Vite Dev-Server starten
- `npm run build` — TypeScript build + Vite build
- `npm run preview` — Gebautes Bundle lokal servieren
- `npm run link:dev` — Lokale Bibliotheken verlinken
- `npm run unlink:dev` — Links entfernen und Registry-Install ausführen

## Troubleshooting

- Kein Kamera-Feed: Prüfe Browser-Berechtigungen/HTTPS und ob eine Kamera verfügbar ist.
- Scan-Performance: `scanInterval` in `QRScanner.tsx` ggf. auf 100ms reduzieren (höhere CPU-Last).
- Link-Probleme: Nach Bibliotheks-Änderungen `npm run build` in der Bibliothek ausführen; Dev-Server neu starten.
