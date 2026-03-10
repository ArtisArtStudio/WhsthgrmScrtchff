/**
 * admin.js — Scratch-Off Game Admin Setup
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Generate a unique gameId and random winnerIndex
 *   2. Collect form data (maxPlayers, groom image)
 *   3. POST a multipart FormData payload to the Google Apps Script Web App
 *   4. Render a success link or error message
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CONFIG = {
  // ⚠️  Replace with your deployed Google Apps Script Web App URL
  GAS_ENDPOINT: "https://script.google.com/macros/s/AKfycbzRzk43xS-NNcp23-tVzTka0RWG4CZznsTbmKRuvcNj_3rd40rW-5AHq6RikTa38DfJMw/exec",

  // Public game base URL (your GitHub Pages site)
  GAME_BASE_URL: "https://artisartstudio.github.io/WhsthgrmScrtchff/",
};

// Show endpoint in the UI so it's visible at a glance
document.getElementById("endpoint-display").textContent = CONFIG.GAS_ENDPOINT;


// ─── DROPZONE DRAG-OVER STYLING ───────────────────────────────────────────────

["dz-groom"].forEach((id) => {
  const zone = document.getElementById(id);
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", () => zone.classList.remove("drag-over"));
});

// Live filename display for groom picker
document.getElementById("groomImage").addEventListener("change", function () {
  document.getElementById("groom-name").textContent = this.files[0]?.name ?? "";
});


// ─── CORE FUNCTIONS ───────────────────────────────────────────────────────────

/**
 * generateGameId()
 * Produces a URL-safe unique ID based on the current timestamp + random suffix.
 * Format: "game_<base36_timestamp>_<4-char random>"
 *
 * @returns {string}  e.g. "game_lf3k9a_x72q"
 */
function generateGameId() {
  const ts   = Date.now().toString(36);                        // base-36 timestamp
  const rand = Math.random().toString(36).slice(2, 6);        // 4 random chars
  return `game_${ts}_${rand}`;
}


/**
 * submitGame()
 * Main orchestrator triggered by the submit button.
 *
 * Steps:
 *   1. Validate required fields
 *   2. Generate gameId + winnerIndex
 *   3. Build FormData payload
 *   4. POST to GAS endpoint
 *   5. Delegate to renderResult()
 */
async function submitGame() {
  // ── 1. Read & validate inputs ────────────────────────────────────────────
  const maxPlayers  = parseInt(document.getElementById("maxPlayers").value, 10);
  const groomName   = document.getElementById("groomName").value.trim();
  const groomFile   = document.getElementById("groomImage").files[0];

  if (!maxPlayers || maxPlayers < 2 || maxPlayers > 20) {
    return renderResult({ ok: false, error: "Max Players must be between 2 and 20." });
  }
  if (!groomName || groomName.length === 0) {
    return renderResult({ ok: false, error: "Please enter the groom's name." });
  }
  if (!groomFile) {
    return renderResult({ ok: false, error: "Please upload a groom image." });
  }
  if (groomFile.size === 0) {
    return renderResult({ ok: false, error: "The selected image file is empty." });
  }

  // ── 2. Generate IDs ───────────────────────────────────────────────────────
  const gameId      = generateGameId();
  const winnerIndex = Math.floor(Math.random() * maxPlayers) + 1;  // 1..maxPlayers

  // Show generated values in the preview inputs
  document.getElementById("gameIdPreview").value  = gameId;
  document.getElementById("winnerPreview").value  = winnerIndex;

  // ── 3. Build payload with base64-encoded file ───────────────────────────────
  // Read the file as base64 to avoid multipart/form-data parsing issues in GAS
  const fileReader = new FileReader();
  
  fileReader.onload = async function(event) {
    const base64Data = event.target.result; // "data:image/jpeg;base64,..."
    const base64Only = base64Data.split(',')[1]; // Extract just the base64 part
    

    
    // Build payload with base64 file
    const payload = new FormData();
    payload.append("action", "createGame");
    payload.append("gameId", gameId);
    payload.append("groomName", groomName);
    payload.append("maxPlayers", maxPlayers.toString());
    payload.append("winnerIndex", winnerIndex.toString());
    payload.append("groomImageBase64", base64Only);
    payload.append("groomImageName", groomFile.name);
    payload.append("groomImageType", groomFile.type);
    

    
    // ── 4. POST to Google Apps Script ─────────────────────────────────────────
    setLoading(true);

    try {

      const response = await fetch(CONFIG.GAS_ENDPOINT, {
        method:  "POST",
        body:    payload,
      });



      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();


      // ── 5. Render outcome ────────────────────────────────────────────────────
      if (json.success) {
        // Construct the public player link regardless of what GAS returns,
        // so the format is always predictable.
        const gameLink = `${CONFIG.GAME_BASE_URL}?gameID=${gameId}`;
        renderResult({ ok: true, gameId, winnerIndex, maxPlayers, gameLink, raw: json });
      } else {
        renderResult({ ok: false, error: json.error ?? "Unknown error from server." });
      }

    } catch (err) {
      // Network errors, CORS issues, malformed JSON, etc.
      renderResult({ ok: false, error: `Request failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };
  
  fileReader.onerror = function() {
    renderResult({ ok: false, error: "Failed to read the image file." });
  };
  
  // Start reading the file
  fileReader.readAsDataURL(groomFile);
}

/**
 * renderResult(data)
 * Displays a success card (with the game link) or an error card.
 *
 * @param {{ ok: boolean, gameId?: string, winnerIndex?: number,
 *           maxPlayers?: number, gameLink?: string, raw?: object,
 *           error?: string }} data
 */
function renderResult(data) {
  const panel  = document.getElementById("result-panel");
  const header = document.getElementById("result-header");
  const body   = document.getElementById("result-body");

  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (data.ok) {
    // ── Success ──────────────────────────────────────────────────────────────
    header.className      = "result-header success";
    header.innerHTML      = `<span>✓</span> Game Created Successfully`;

    // Update the endpoint section with the game link
    const endpointDisplay = document.getElementById("endpoint-display");
    if (endpointDisplay) {
      endpointDisplay.innerHTML = `<a href="${data.gameLink}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;cursor:pointer">${data.gameLink}</a>`;
    }

    body.innerHTML = `
      <div class="result-field">
        <div class="result-field-label">Public Game Link</div>
        <a class="result-link" href="${data.gameLink}" target="_blank" rel="noopener">
          ${data.gameLink}
        </a><br/>
        <button class="copy-btn" onclick="copyToClipboard('${data.gameLink}', this)">
          COPY LINK
        </button>
      </div>
      <div class="result-field">
        <div class="result-field-label">Game ID</div>
        <code style="font-family:var(--mono);font-size:12px;color:var(--text)">
          ${data.gameId}
        </code>
      </div>
      <div class="result-field">
        <div class="result-field-label">Winner Index / Max Players</div>
        <code style="font-family:var(--mono);font-size:12px;color:var(--accent)">
          ${data.winnerIndex} / ${data.maxPlayers}
        </code>
      </div>
      ${data.raw?.debug ? `
      <div class="result-field" style="background:rgba(100,100,100,0.1);padding:8px;border-radius:4px">
        <div class="result-field-label" style="color:#666">Debug Info</div>
        <div style="font-size:11px;color:#666">
          Blob received: ${data.raw.debug.blobReceived}<br/>
          Blob type: ${data.raw.debug.blobType}<br/>
          Blob name: ${data.raw.debug.blobName || 'null'}<br/>
          All params: ${data.raw.debug.allParams.join(', ')}
        </div>
      </div>
      ` : ''}
      ${data.raw?.groomUrl ? `
      <div class="result-field">
        <div class="result-field-label">Groom Image URL</div>
        <code style="font-family:var(--mono);font-size:11px;color:var(--accent);word-break:break-all">
          ${data.raw.groomUrl}
        </code>
      </div>
      ` : ''}`;
  } else {
    // ── Error ────────────────────────────────────────────────────────────────
    header.className = "result-header error";
    header.innerHTML = `<span>✕</span> Setup Failed`;

    body.innerHTML = `
      <div class="result-field">
        <div class="result-field-label">Error Details</div>
        <div class="error-msg">${escapeHtml(data.error)}</div>
      </div>
    `;
  }
}


// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * setLoading(bool)
 * Toggles the submit button between normal and loading states.
 */
function setLoading(isLoading) {
  const btn     = document.getElementById("submit-btn");
  const label   = document.getElementById("btn-label");
  const spinner = document.getElementById("spinner");

  btn.disabled          = isLoading;
  label.textContent     = isLoading ? "Creating…" : "Create Game";
  spinner.style.display = isLoading ? "block" : "none";
}

/**
 * copyToClipboard(text, btn)
 * Copies a string to the clipboard and gives button feedback.
 */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "COPIED ✓";
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    btn.textContent = "FAILED";
  }
}

/**
 * escapeHtml(str)
 * Prevents XSS when inserting error strings into innerHTML.
 */
function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// ─── EVENT BINDING ────────────────────────────────────────────────────────────

document.getElementById("submit-btn").addEventListener("click", submitGame);
