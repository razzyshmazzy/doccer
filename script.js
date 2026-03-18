// config — paste your OAuth 2.0 client ID (web application) here
const clientId = '586952210134-il822l85pg84p6h50d5nk34nd4s99nmv.apps.googleusercontent.com';

const scope = 'https://www.googleapis.com/auth/drive.readonly email profile';
const sessionKey = 'doccer_token';

// state
let accessToken = null;
let cachedDocs = null;
let forceConsent = false; // set after sign-out to re-grant scope for new account

// dom refs
const signinScreen = document.getElementById('signin-screen');
const appScreen = document.getElementById('app-screen');
const authError = document.getElementById('auth-error');
const signinBtn = document.getElementById('signin-btn');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');
const signoutBtn = document.getElementById('signout-btn');
const loadingState = document.getElementById('loading-state');
const loadingMessage = document.getElementById('loading-message');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const emptyState = document.getElementById('empty-state');
const docsState = document.getElementById('docs-state');
const docsCount = document.getElementById('docs-count');
const docsRange = document.getElementById('docs-range');
const docsTbody = document.getElementById('docs-tbody');
const downloadBtn = document.getElementById('download-btn');

// helpers
const show = (el) => { el.hidden = false; };
const hide = (el) => { el.hidden = true; };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function showAppState(state) {
  [loadingState, errorState, emptyState, docsState].forEach(hide);
  show(state);
}

// token storage
function saveToken(accessTok, expiresIn) {
  sessionStorage.setItem(sessionKey, JSON.stringify({
    access_token: accessTok,
    expires_at: Date.now() + expiresIn * 1000 - 60_000,
  }));
}

function loadStoredToken() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionKey));
    if (stored && stored.expires_at > Date.now()) return stored.access_token;
  } catch {}
  return null;
}

function clearStoredToken() {
  sessionStorage.removeItem(sessionKey);
}

// google identity services
function handleTokenResponse(response) {
  if (!response.access_token) {
    if (response.error) {
      const msg = response.error === 'access_denied'
        ? 'Access was denied. Please try again.'
        : `Sign-in failed: ${response.error}`;
      showSignIn(msg);
    }
    return;
  }

  accessToken = response.access_token;
  saveToken(accessToken, response.expires_in);
  onAuthenticated();
}

function signIn() {
  if (!window.google?.accounts?.oauth2) {
    showSignIn('Google Sign-In is still loading — please try again in a moment.');
    return;
  }
  const prompt = forceConsent ? 'consent' : 'select_account';
  forceConsent = false;
  google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: scope,
    callback: handleTokenResponse,
  }).requestAccessToken({ prompt });
}

function showSignIn(errorMsg) {
  hide(appScreen);
  show(signinScreen);
  if (errorMsg) {
    authError.textContent = errorMsg;
    show(authError);
  } else {
    hide(authError);
  }
}

// after sign-in
async function onAuthenticated() {
  hide(signinScreen);
  show(appScreen);
  showAppState(loadingState);

  try {
    const info = await apiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    userEmail.textContent = info.email ?? '';
    userAvatar.textContent = (info.email ?? '?')[0];
  } catch {}

  loadDocs();
}

// api helpers
async function apiFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    clearStoredToken();
    accessToken = null;
    throw Object.assign(new Error('Session expired. Please sign in again.'), { status: 401 });
  }
  if (res.status === 403) {
    clearStoredToken();
    accessToken = null;
    forceConsent = true;
    throw Object.assign(new Error('Drive access was not granted. Please sign in and allow access.'), { status: 403 });
  }
  if (!res.ok) throw new Error(`API error (${res.status})`);
  return res.json();
}

// drive api
async function fetchAllDocs() {
  const docs = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.document' and 'me' in owners and trashed=false",
      fields: 'nextPageToken,files(id,name,createdTime)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await apiFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    docs.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
}

// load & render
async function loadDocs() {
  loadingMessage.textContent = 'Fetching your Google Docs…';
  showAppState(loadingState);
  try {
    cachedDocs = await fetchAllDocs();
    renderDocs(cachedDocs);
  } catch (err) {
    if (err.status === 401 || err.status === 403) showSignIn(err.message);
    else { errorMessage.textContent = err.message || 'Failed to load documents.'; showAppState(errorState); }
  }
}

function renderDocs(docs) {
  if (docs.length === 0) {
    showAppState(emptyState);
    return;
  }

  docsCount.textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''}`;
  const oldest = formatDate(docs[0].createdTime);
  const newest = formatDate(docs[docs.length - 1].createdTime);
  docsRange.textContent = docs.length > 1 ? `${oldest} → ${newest}` : oldest;

  docsTbody.innerHTML = '';
  const fragment = document.createDocumentFragment();
  docs.forEach((doc, i) => {
    const tr = document.createElement('tr');

    const numTd = document.createElement('td');
    numTd.className = 'col-num';
    numTd.textContent = i + 1;

    const titleTd = document.createElement('td');
    titleTd.className = 'title-cell';
    titleTd.textContent = doc.name || 'Untitled';
    titleTd.title = doc.name || 'Untitled';

    const dateTd = document.createElement('td');
    dateTd.className = 'col-date';
    dateTd.textContent = formatDate(doc.createdTime);

    tr.append(numTd, titleTd, dateTd);
    fragment.appendChild(tr);
  });
  docsTbody.appendChild(fragment);

  showAppState(docsState);
}

// pdf export
async function exportDocAsPDF(fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 401) {
    clearStoredToken();
    accessToken = null;
    throw Object.assign(new Error('Session expired. Please sign in again.'), { status: 401 });
  }
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.arrayBuffer();
}

async function downloadPDF() {
  if (!cachedDocs || cachedDocs.length === 0) return;
  downloadBtn.disabled = true;

  try {
    const pdfBuffers = new Array(cachedDocs.length).fill(null);
    const concurrency = 5;
    for (let i = 0; i < cachedDocs.length; i += concurrency) {
      downloadBtn.textContent = `Exporting... (${Math.min(i + concurrency, cachedDocs.length)}/${cachedDocs.length})`;
      const results = await Promise.all(
        cachedDocs.slice(i, i + concurrency).map(d =>
          exportDocAsPDF(d.id).catch(err => {
            if (err.status === 401) throw err;
            console.warn(`Failed to export "${d.name}":`, err.message);
            return null;
          })
        )
      );
      results.forEach((buf, j) => { pdfBuffers[i + j] = buf; });
    }

    downloadBtn.textContent = 'Merging PDFs...';
    const merged = await buildMergedPDF(cachedDocs, pdfBuffers);
    const bytes = await merged.save();

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'my-google-docs.pdf'; a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (err.status === 401 || err.status === 403) { showSignIn(err.message); return; }
    alert(`Export failed: ${err.message}`);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Export PDF';
  }
}

// pdf-lib: merge with toc + title pages
async function buildMergedPDF(docs, pdfBuffers) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const merged = await PDFDocument.create();
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const boldFont = await merged.embedFont(StandardFonts.HelveticaBold);

  const tocPage = merged.addPage([595.28, 841.89]);
  buildTOCPage(tocPage, docs, font, boldFont, rgb);

  for (let i = 0; i < docs.length; i++) {
    const titlePage = merged.addPage([595.28, 841.89]);
    buildTitlePage(titlePage, docs[i], i + 1, font, boldFont, rgb);

    if (pdfBuffers[i]) {
      try {
        const src = await PDFDocument.load(pdfBuffers[i]);
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
      } catch {
        const errPage = merged.addPage([595.28, 841.89]);
        errPage.drawText(`[Could not render: "${docs[i].name}"]`, {
          x: 72, y: 400, size: 11, font, color: rgb(0.5, 0.5, 0.5),
        });
      }
    }
  }

  return merged;
}

function buildTOCPage(page, docs, font, boldFont, rgb) {
  const { width, height } = page.getSize();
  const margin = 72;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  page.drawText('My Google Docs', {
    x: margin, y: height - margin - 28,
    size: 28, font: boldFont, color: rgb(0.1, 0.1, 0.18),
  });

  const subtitle = `${userEmail.textContent}  ·  ${date}  ·  ${docs.length} document${docs.length !== 1 ? 's' : ''}`;
  page.drawText(subtitle, {
    x: margin, y: height - margin - 50,
    size: 10, font, color: rgb(0.42, 0.45, 0.50),
    maxWidth: width - margin * 2,
  });

  page.drawLine({
    start: { x: margin, y: height - margin - 62 },
    end: { x: width - margin, y: height - margin - 62 },
    thickness: 0.5, color: rgb(0.88, 0.88, 0.90),
  });

  const colNum = margin;
  const colTitle = margin + 36;
  const colDate = width - margin - 80;
  let y = height - margin - 82;
  const rowH = 18;

  page.drawText('#',       { x: colNum,   y, size: 9, font: boldFont, color: rgb(0.31, 0.27, 0.9) });
  page.drawText('Title',   { x: colTitle, y, size: 9, font: boldFont, color: rgb(0.31, 0.27, 0.9) });
  page.drawText('Created', { x: colDate,  y, size: 9, font: boldFont, color: rgb(0.31, 0.27, 0.9) });
  y -= rowH;

  for (let i = 0; i < docs.length; i++) {
    if (y < margin + rowH) break;

    if (i % 2 === 0) {
      page.drawRectangle({
        x: margin - 4, y: y - 4,
        width: width - margin * 2 + 8, height: rowH,
        color: rgb(0.97, 0.98, 0.99),
      });
    }

    const title = (docs[i].name || 'Untitled').substring(0, 65);
    page.drawText(String(i + 1),                   { x: colNum,   y, size: 9, font, color: rgb(0.6, 0.6, 0.65) });
    page.drawText(title,                           { x: colTitle, y, size: 9, font, color: rgb(0.1, 0.1, 0.18), maxWidth: colDate - colTitle - 8 });
    page.drawText(formatDate(docs[i].createdTime), { x: colDate,  y, size: 9, font, color: rgb(0.6, 0.6, 0.65) });
    y -= rowH;
  }
}

function buildTitlePage(page, doc, index, font, boldFont, rgb) {
  const { width, height } = page.getSize();

  page.drawRectangle({ x: 0, y: 0, width: 6, height, color: rgb(0.31, 0.27, 0.9) });

  page.drawText(String(index).padStart(2, '0'), {
    x: 72, y: height / 2 + 60,
    size: 80, font: boldFont, color: rgb(0.93, 0.93, 0.96),
  });

  page.drawText(doc.name || 'Untitled', {
    x: 72, y: height / 2 + 10,
    size: 26, font: boldFont, color: rgb(0.1, 0.1, 0.18),
    maxWidth: width - 144, lineHeight: 34,
  });

  page.drawText(`Created ${formatDate(doc.createdTime)}`, {
    x: 72, y: height / 2 - 54,
    size: 11, font, color: rgb(0.6, 0.6, 0.65),
  });
}

// sign-out
function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  clearStoredToken();
  accessToken = null;
  cachedDocs = null;
  forceConsent = true; // next sign-in must re-grant scope (may be a different account)
  docsTbody.innerHTML = '';
  showSignIn();
}

// background video
const bgVideo = document.querySelector('.bg-video');
if (bgVideo) {
  bgVideo.addEventListener('loadedmetadata', () => { bgVideo.playbackRate = 0.5; });
}

// event listeners
signinBtn.addEventListener('click', signIn);
signoutBtn.addEventListener('click', signOut);
downloadBtn.addEventListener('click', downloadPDF);
retryBtn.addEventListener('click', loadDocs);

// boot
function init() {
  const stored = loadStoredToken();
  if (stored) {
    accessToken = stored;
    hide(signinScreen);
    onAuthenticated();
  } else {
    show(signinScreen);
    hide(appScreen);
  }
}

init();
