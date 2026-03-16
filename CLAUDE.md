# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

**Recommended (no server needed):** open `index.html` with VS Code Live Server or any static file server.

**Alternative (Node.js backend):**
```bash
npm install
npm run dev   # node --watch server.js  →  http://localhost:3000
```

## Architecture

The app is fully client-side. `server.js` is an alternative Node.js backend (kept for reference) but is not required.

```
index.html   — Two screens: sign-in card and main app (toggled via hidden attribute)
script.js    — All logic: GIS auth, Drive API calls, table render, jsPDF generation
styles.css   — Single stylesheet for both screens
server.js    — Optional Express backend (own OAuth flow, pdfkit PDF streaming)
```

**CDN dependencies loaded in index.html:**
- `accounts.google.com/gsi/client` — Google Identity Services (token flow)
- `jspdf` + `jspdf-autotable` — client-side PDF generation

### Data flow

1. On load, `init()` checks `sessionStorage` for a valid token; if found, skips sign-in.
2. Sign-in button → `google.accounts.oauth2.initTokenClient().requestAccessToken()` → popup OAuth consent.
3. `handleTokenResponse()` stores the access token + expiry in `sessionStorage` and calls `onAuthenticated()`.
4. `fetchAllDocs()` paginates `https://www.googleapis.com/drive/v3/files` directly from the browser (loop on `nextPageToken`), sorts by `createdTime` ASC.
5. "Download PDF" → `downloadPDF()` generates the file entirely in-browser with jsPDF autoTable, then triggers a blob download — no server round-trip.

### Key notes

- `CLIENT_ID` at the top of `script.js` must be replaced with the user's OAuth client ID.
- Token expiry is 1 hour; `sessionStorage` is cleared automatically when the tab closes. On 401, the user is sent back to the sign-in screen.
- Sign-out calls `google.accounts.oauth2.revoke()` to invalidate the token server-side, then clears `sessionStorage`.

## Setup

1. In [Google Cloud Console](https://console.cloud.google.com):
   - Enable **Google Drive API** + **Google People API**.
   - Create an **OAuth 2.0 Client ID** (type: **Web application**).
   - Under **Authorised JavaScript origins** add your Live Server origin, e.g. `http://localhost:5500` and `http://127.0.0.1:5500`. No redirect URIs needed.
2. Paste the Client ID into `script.js` → `const CLIENT_ID = '...'`.
3. Open `index.html` with Live Server.
