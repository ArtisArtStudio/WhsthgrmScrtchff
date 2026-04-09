/**
 * main.js — Scratch-Off Game Frontend
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Extract gameID from URL parameters
 *   2. Fetch game data from code.gs
 *   3. Register player and wait for all players to connect
 *   4. Load groom image as background
 *   5. Enable scratching and determine winner
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzRzk43xS-NNcp23-tVzTka0RWG4CZznsTbmKRuvcNj_3rd40rW-5AHq6RikTa38DfJMw/exec";

// Original background image dimensions
const PORTRAIT_IMAGE_HEIGHT = 1080;
const PORTRAIT_IMAGE_WIDTH = 1920;
const LANDSCAPE_IMAGE_HEIGHT = 1080;
const LANDSCAPE_IMAGE_WIDTH = 1920;
// Your point on the original image
const PORTRAIT_SCRATCHER_X = 845;
const PORTRAIT_SCRATCHER_Y = 470;
const LANDSCAPE_SCRATCHER_X = 320;
const LANDSCAPE_SCRATCHER_Y = 270;

// Number of decoy images available
const decoyImage = 2;

// ─── STATE ───────────────────────────────────────────────────────────────────

let gameID;
let gameData = null;
let playerNum = null;
let allPlayersConnected = false;
let isWinner = false;
let clientId = null; // persistent identifier for this browser/session
let isHost = false; // whether this player is the host
let gameStarted = false;
let currentMaxPlayers = 0;
let hostMessageToggle = 0; // Toggle counter for alternating host messages
let playerStatus = ""; // player's current status

let targetX;
let targetY;
let originalWidth;
let originalHeight;
let scratcher, canvasOriginalHeight, canvasOriginalWidth;
let scratchers = [];
let pct = 0;

// Color and text configuration
const color1 = '#ff95c8';
const color2 = '#5194f8';
const color3 = '#969696';
const colortxt1 = '#ff0b9a';
const colortxt2 = '#7FB1ED';
const colortxt3 = '#000000';

let color = color2;
let colortxt = colortxt2;
let gendertext = "It is a Win!";
let soundHandle = new Audio();
let triggered = false;
let nosound = true;

// ─── MESSAGE PANEL HELPERS ───────────────────────────────────────────────────

/**
 * showMessagePanel(title, message, type='error', autoClose=false)
 * Displays a modal message panel (alternative to crispy-toast for important messages)
 * @param {string} title - Panel title
 * @param {string} message - Panel message
 * @param {string} type - 'error', 'info', or 'warning'
 * @param {boolean|number} autoClose - If true, auto-close after 1.5s. If number, auto-close after that many ms
 */
function showMessagePanel(title, message, type = 'error', autoClose = false) {
  const panel = document.getElementById('message-panel');
  const titleEl = document.getElementById('panel-title');
  const msgEl = document.getElementById('panel-message');
  const closeBtn = document.getElementById('panel-close-btn');
  
  titleEl.textContent = title;
  msgEl.textContent = message;
  
  // Remove previous type classes
  panel.classList.remove('error', 'info', 'warning');
  panel.classList.add(type, 'show');
  
  // Handle auto-close
  if (autoClose) {
    const delay = typeof autoClose === 'number' ? autoClose : 1500;
    setTimeout(() => {
      closeMessagePanel();
    }, delay);
    
    // Hide the close button for auto-close messages
    closeBtn.style.display = 'none';
  } else {
    // Show the close button for manual-close messages
    closeBtn.style.display = 'block';
  }
}

/**
 * closeMessagePanel()
 * Closes the message panel
 */
function closeMessagePanel() {
  const panel = document.getElementById('message-panel');
  panel.classList.remove('show');
}

// Flag to prevent infinite reload loops
let hasAttemptedReload = false;

/**
 * Handles the OK button click - performs action based on message type
 */
function handleMessagePanelOk() {
  const panel = document.getElementById('message-panel');
  const msgEl = document.getElementById('panel-message');
  const messageText = msgEl?.textContent || '';
  
  // Check if message contains "failed to fetch" or similar network errors
  if (!hasAttemptedReload &&
      (messageText.toLowerCase().includes('failed to fetch') || 
       messageText.toLowerCase().includes('network') ||
       messageText.toLowerCase().includes('cors'))) {
    // Force page refresh for network errors (only once per session)
    hasAttemptedReload = true;
    location.reload();
  } else {
    // For all other messages, just close the panel
    closeMessagePanel();
  }
}

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async function() {
  // Attach message panel button listener EARLY to ensure it's always available
  const panelCloseBtn = document.getElementById('panel-close-btn');
  if (panelCloseBtn) {
    panelCloseBtn.addEventListener('click', handleMessagePanelOk);
  }
  
  // NEW LOGIC: Use fingerprinting for device-dependent PID
  clientId = localStorage.getItem('scratchClientId');
  
  if (!clientId) {
    // Generate an ID based on the device itself
    clientId = generateDeviceFingerprint();
    localStorage.setItem('scratchClientId', clientId);
  }
  
  // Extract gameID from URL
  const params = new URLSearchParams(window.location.search);
  gameID = params.get("gameID");

  if (!gameID) {
    showError("No game ID provided in URL");
    scratcher = document.getElementById('scratcher');
  canvasOriginalHeight = scratcher.height;
  canvasOriginalWidth = scratcher.width;
  scratcher.style.zIndex = '0';

    let scratchers = new Array(1);
    scratchers[0] = new Scratcher('scratcher');
    scratchers[0].setImages('images/s1bg.jpg', 'images/foreground.jpg');
    return;
  }

  showLoading("Fetching game data...");
  
  try {
    // Fetch game data
    const payload = new FormData();
    payload.append("action", "getGameData");
    payload.append("gameId", gameID);

    const response = await fetch(GAS_ENDPOINT, {
      method: "POST",
      body: payload
    });

    const json = await response.json();

    if (!json.success) {
      showError("Game not found: " + (json.error || "Unknown error"));
      return;
    }

    gameData = json.data;
    
    // Register this player
    showLoading("Registering player...");
    await registerPlayer();

    // Refresh game data to get accurate connected player count
    const gameDataPayload = new FormData();
    gameDataPayload.append("action", "getGameData");
    gameDataPayload.append("gameId", gameID);
    if (playerNum) gameDataPayload.append("playerNum", playerNum);

    const gameDataResponse = await fetch(GAS_ENDPOINT, {
      method: "POST",
      body: gameDataPayload
    });

    const gameDataJson = await gameDataResponse.json();
    if (gameDataJson.success) {
      gameData = gameDataJson.data;
    }

    // Initialize maxPlayers from game data
    currentMaxPlayers = gameData.maxPlayers;

    // Check if game is already finished - skip to end screen
    if (gameData.gameStatus === "Finished") {
      showGameFinished();
      return;
    }

    // Wait in lobby for host to start the game or for any other changes
    showLoading("Entering lobby...");
    await waitInLobby();

    // All players connected and game started - initialize game
    showLoading("Initializing game...");
    initPage();

  } catch (err) {
    // registration or initialization failed
    showError("Error: " + err.message);
    showMessagePanel('❌ Error', err.message, 'error');
  }
});

// ─── FUNCTIONS ───────────────────────────────────────────────────────────────

/**
 * Register this player and get their player number
 */
async function registerPlayer() {
  const payload = new FormData();
  payload.append("action", "registerPlayer");
  payload.append("gameId", gameID);
  if (clientId) payload.append("clientId", clientId);

  const response = await fetch(GAS_ENDPOINT, {
    method: "POST",
    body: payload
  });

  const json = await response.json();

  if (!json.success) {
    throw new Error("Failed to register: " + (json.error || "Unknown error"));
  }

  playerNum = json.playerNum;
  isHost = json.isHost || false;
  isWinner = (playerNum === gameData.winnerIndex);
  playerStatus = json.status || "";
  
  console.log("Player registered: playerNum=" + playerNum + ", isHost=" + isHost + ", isWinner=" + isWinner + ", status=" + playerStatus);
}

let hostPanelShown = false; // Track if host panel has been shown

/**
 * Wait in the lobby for the host to start the game or for any status changes
 */
async function waitInLobby() {
  const maxWaitTime = 60 * 60 * 1000; // 60 minutes max
  const startTime = Date.now();
  const pollInterval = 1500; // 1.5 seconds
  
  // Show appropriate message (but don't show host panel yet)
  if (isHost) {
    showLoading("Waiting for players...");
  } else {
    showLoading("Waiting for other players...");
  }

  while (Date.now() - startTime < maxWaitTime) {
    // Poll game status
    const payload = new FormData();
    payload.append("action", "pollGameStatus");
    payload.append("gameId", gameID);
    if (clientId) payload.append("clientId", clientId);

    try {
      const response = await fetch(GAS_ENDPOINT, {
        method: "POST",
        body: payload
      });

      const json = await response.json();
      console.log("Poll response:", json);

      if (json.success) {
        const newMaxPlayers = json.maxPlayers;
        const newWinnerIndex = json.winnerIndex;
        
        // For host: show the control panel only after first successful poll and game hasn't started
        if (isHost && !hostPanelShown && json.gameStatus !== "Started") {
          showHostControlPanel();
          hostPanelShown = true;
        }
        
        // Update winnerIndex if it changed
        if (newWinnerIndex !== gameData.winnerIndex) {
          gameData.winnerIndex = newWinnerIndex;
          isWinner = (playerNum === newWinnerIndex);
          //console.log("Winner index updated to: " + newWinnerIndex);
        }

        // Update maxPlayers if it changed
        if (newMaxPlayers !== currentMaxPlayers) {
          currentMaxPlayers = newMaxPlayers;
          console.log("Max players updated to: " + newMaxPlayers);
          updateHostPanelMaxPlayers(newMaxPlayers);
        }

        // Update connected players count for display
        gameData.connectedPlayers = json.connectedPlayers;

        // Check if this player was kicked from the lobby
        if (!json.playerIsActive && !isHost) {
          showKickedMessage();
          throw new Error("You were removed from the lobby");
        }

        // Check if host changed
        if (json.hostClientId !== gameData.hostClientId) {
          if (json.hostClientId === clientId && !isHost) {
            // I became the host! (only show panel if game hasn't started)
            isHost = true;
            if (json.gameStatus !== "Started") {
              showHostControlPanel();
              hostPanelShown = true;
            }
            showMessagePanel('🎮 Host Status', "You are now the host!", 'info');
            //console.log("Promoted to host");
          } else if (isHost && json.hostClientId !== clientId) {
            // I was demoted (shouldn't happen, but handle it)
            isHost = false;
            hideHostControlPanel();
            hostPanelShown = false;
            showMessagePanel('⚠️ Host Status', "Host role transferred", 'warning');
          }
          gameData.hostClientId = json.hostClientId;
        }

        // Update player count display in panel if visible
        updateHostPanelDisplay();
        
        // Update loading message with current count
        if (isHost) {
          // Toggle message every 3 polls (about 4.5 seconds)
          hostMessageToggle++;
          const showInstruction = (Math.floor(hostMessageToggle / 3) % 2 === 0);
          
          if (showInstruction) {
            showLoading("You are the host. Use the panel below");
          } else {
            showLoading("Waiting for other players... (" + json.connectedPlayers + "/" + newMaxPlayers + ")");
          }
        } else {
          showLoading("Waiting for host to start... (" + json.connectedPlayers + "/" + newMaxPlayers + ")");
        }

        // Check if game started
        if (json.gameStatus === "Started") {
          gameStarted = true;
          allPlayersConnected = true;
          console.log("Game started!");
          return; // Exit the loop, proceed to game init
        }
      }
    } catch (err) {
      console.error("Error polling game status: " + err.message);
      // Continue polling even if there's an error
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error("Timeout waiting for host to start the game");
}

/**
 * Show the host control panel
 */
function showHostControlPanel() {
  hostMessageToggle = 0; // Reset toggle counter
  const panel = document.getElementById("host-control-panel");
  if (panel) {
    panel.style.display = "block";
    updateHostPanelDisplay();
    
    // Attach event listeners
    const startBtn = document.getElementById("host-start-btn");
    const increaseBtn = document.getElementById("host-increase-btn");
    const decreaseBtn = document.getElementById("host-decrease-btn");
    const maxInput = document.getElementById("host-max-input");
    
    if (startBtn) {
      startBtn.onclick = hostStartGame;
    }
    if (increaseBtn) {
      increaseBtn.onclick = () => hostChangeMaxPlayers(1);
    }
    if (decreaseBtn) {
      decreaseBtn.onclick = () => hostChangeMaxPlayers(-1);
    }
    if (maxInput) {
      maxInput.onchange = () => {
        const newMax = parseInt(maxInput.value, 10);
        if (!isNaN(newMax) && newMax >= 1 && newMax <= 20) {
          hostChangeMaxPlayers(newMax - currentMaxPlayers);
        }
      };
    }
  }
}

/**
 * Hide the host control panel
 */
function hideHostControlPanel() {
  const panel = document.getElementById("host-control-panel");
  if (panel) {
    panel.style.display = "none";
  }
}

/**
 * Update the host panel display with current numbers
 */
function updateHostPanelDisplay() {
  const countValue = document.getElementById("host-count-value");
  const maxValue = document.getElementById("host-max-value");
  const maxInput = document.getElementById("host-max-input");
  const startBtn = document.getElementById("host-start-btn");
  
  if (countValue) countValue.textContent = gameData.connectedPlayers || "0";
  if (maxValue) maxValue.textContent = currentMaxPlayers || "0";
  if (maxInput) maxInput.value = currentMaxPlayers || "0";
  
  // Disable Start Game button if not all players are connected
  const allConnected = gameData.connectedPlayers >= currentMaxPlayers;
  if (startBtn) {
    startBtn.disabled = !allConnected;
    startBtn.style.opacity = allConnected ? "1" : "0.6";
    startBtn.style.cursor = allConnected ? "pointer" : "not-allowed";
  }
}

/**
 * Update max players display when it changes
 */
function updateHostPanelMaxPlayers(newMax) {
  const maxValue = document.getElementById("host-max-value");
  const maxInput = document.getElementById("host-max-input");
  
  if (maxValue) maxValue.textContent = newMax;
  if (maxInput) maxInput.value = newMax;
}

/**
 * Host presses "Start Game" button
 */
async function hostStartGame() {
  const statusMsg = document.getElementById("host-status-msg");
  const btn = document.getElementById("host-start-btn");
  
  if (btn) btn.disabled = true;
  if (statusMsg) statusMsg.textContent = "Starting...";

  try {
    const payload = new FormData();
    payload.append("action", "startGame");
    payload.append("gameId", gameID);
    payload.append("clientId", clientId);

    const response = await fetch(GAS_ENDPOINT, {
      method: "POST",
      body: payload
    });

    const json = await response.json();
    console.log("Start game response:", json);

    if (json.success) {
      showMessagePanel('🎮 Game Started', "The game has begun!", 'info', true);
      hideHostControlPanel();
      gameStarted = true;
      allPlayersConnected = true;
      // The lobby loop will detect the change and exit
    } else {
      showMessagePanel('❌ Error', json.error || "Failed to start game", 'error');
      if (statusMsg) statusMsg.textContent = "Error: " + (json.error || "Failed");
    }
  } catch (err) {
    showMessagePanel('❌ Error', "Error: " + err.message, 'error');
    if (statusMsg) statusMsg.textContent = "Error: " + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Host changes the maximum number of players
 */
async function hostChangeMaxPlayers(delta) {
  const newMax = currentMaxPlayers + delta;
  
  if (newMax < 1 || newMax > 20) {
    showMessagePanel('⚠️ Invalid Input', "Max players must be between 1 and 20", 'warning');
    return;
  }

  const statusMsg = document.getElementById("host-status-msg");
  if (statusMsg) statusMsg.textContent = "Updating...";

  try {
    const payload = new FormData();
    payload.append("action", "updateMaxPlayers");
    payload.append("gameId", gameID);
    payload.append("clientId", clientId);
    payload.append("newMaxPlayers", newMax);

    const response = await fetch(GAS_ENDPOINT, {
      method: "POST",
      body: payload
    });

    const json = await response.json();

    if (json.success) {
      currentMaxPlayers = json.newMaxPlayers;
      updateHostPanelMaxPlayers(newMax);
      
      if (json.droppedCount > 0) {
        showMessagePanel('ℹ️ Players Removed', "Reduced limit. " + json.droppedCount + " player(s) removed", 'info');
      }
      
      if (statusMsg) statusMsg.textContent = "Max: " + newMax;
      setTimeout(() => {
        if (statusMsg) statusMsg.textContent = "";
      }, 2000);
    } else {
      showMessagePanel('❌ Error', json.error || "Failed to update", 'error');
      if (statusMsg) statusMsg.textContent = "Error: " + (json.error || "Failed");
    }
  } catch (err) {
    showMessagePanel('❌ Error', "Error: " + err.message, 'error');
    if (statusMsg) statusMsg.textContent = "Error: " + err.message;
  }
}

/**
 * Show message to kicked players
 */
function showKickedMessage() {
  const modal = document.getElementById("kicked-message");
  if (modal) {
    modal.style.display = "block";
    const returnBtn = document.getElementById("kicked-return-btn");
    if (returnBtn) {
      returnBtn.onclick = () => {
        window.location.href = "/";
      };
    }
  }
}

/**
 * Show loading message
 */
function showLoading(message, progress = null) {
  const loadingDiv = document.getElementById("loading-text");
  const messageDiv = document.getElementById("loading-message");
  const progressBar = document.getElementById("progress-bar");
  const progressFill = document.getElementById("progress-fill");
  if (loadingDiv && messageDiv) {
    messageDiv.textContent = message;
    loadingDiv.style.display = 'block';
    if (progress !== null) {
      progressBar.style.display = 'block';
      progressFill.style.width = progress + '%';
    } else {
      progressBar.style.display = 'none';
    }
  }
}

/**
 * Preload an image and return a promise
 */
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.warn('Image failed to load:', url, e);
      reject(new Error('Failed to load image: ' + url));
    };
    img.src = url;
  });
}

/**
 * Show error message
 */
function showError(message) {
  const errorDiv = document.getElementById("error-text");
  if (!errorDiv) {
    const div = document.createElement("div");
    div.id = "error-text";
    div.style.cssText = "position:fixed;top:20px;left:20px;right:20px;padding:20px;background:rgba(224,90,43,0.9);color:white;border-radius:4px;font-size:16px;z-index:1000";
    document.body.insertBefore(div, document.body.firstChild);
  }
  const errorDiv2 = document.getElementById("error-text");
  errorDiv2.textContent = message;
}

/**
 * Initialize the game page
 */
async function initPage() {
  if (!document.createElement('canvas').getContext) {
    showError('This browser does not support canvas');
    return;
  }

  // Hide host control panel and loading messages
  hideHostControlPanel();
  const loadingDiv = document.getElementById("loading-text");
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }

  // Poll for latest status to ensure isWinner is up to date
  const pollPayload = new FormData();
  pollPayload.append("action", "pollGameStatus");
  pollPayload.append("gameId", gameID);
  if (clientId) pollPayload.append("clientId", clientId);

  try {
    const pollResponse = await fetch(GAS_ENDPOINT, { method: "POST", body: pollPayload });
    const pollJson = await pollResponse.json();
    if (pollJson.success) {
      const newWinnerIndex = pollJson.winnerIndex;
      if (newWinnerIndex !== gameData.winnerIndex) {
        gameData.winnerIndex = newWinnerIndex;
        isWinner = (playerNum === newWinnerIndex);
        console.log("Winner index updated before setup: " + newWinnerIndex);
      }
      // Also update maxPlayers if changed
      if (pollJson.maxPlayers !== currentMaxPlayers) {
        currentMaxPlayers = pollJson.maxPlayers;
      }
    }
  } catch (err) {
    console.warn("Failed to poll before setup: " + err.message);
  }

  // Groom name display
  const babyEl = document.getElementById("baby");
  if (babyEl) babyEl.textContent = 'Baby ' + gameData.groomName;
  const surnameEl = document.getElementById("surname");
  if (surnameEl) surnameEl.textContent = gameData.groomName;
     // Start reset detection polling for non-host players who have already finished scratching
     if (!isHost && (playerStatus === "scratched" || playerStatus === "revealed")) {
    startResetDetectionPolling();
  }
// Always show sound dialog on refresh (moved outside any conditional)
  document.getElementById("id01").style.display = 'block';
  
  // Sound setup
  document.querySelector(".nosoundbtn").addEventListener("click", function() {
    document.getElementById("id01").style.display = 'none';
    nosound = true;
    setupScratcher();
  });

  document.querySelector(".withsoundbtn").addEventListener("click", function() {
    document.getElementById("id01").style.display = 'none';
    nosound = false;
    soundHandle = document.getElementById("soundHandle");
    soundHandle.autoplay = false;
    soundHandle.muted = false;
    // Audio will be played after scratchesended event
    setupScratcher();
  });


  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState !== "visible") {
      soundHandle.pause();
      soundHandle.currentTime = 0;
    }
  });

  document.getElementById("resetbutton").style.backgroundColor = colortxt;

}

/**
 * Setup the scratcher canvas
 */
function setupScratcher() {
  scratcher = document.getElementById('scratcher');
  canvasOriginalHeight = scratcher.height;
  canvasOriginalWidth = scratcher.width;
  scratcher.style.zIndex = '0';

  scratchers = new Array(1);
  scratchers[0] = new Scratcher('scratcher');

  // Preload images before passing to scratcher to avoid broken image state
  let rnd = Math.floor(Math.random() * decoyImage) + 1;
  let backgroundImage = isWinner ? (gameData.groomBase64 ? 'data:' + gameData.groomMimeType + ';base64,' + gameData.groomBase64 : gameData.groomUrl) : 'images/s' + rnd + 'bg.jpg';

  function startScratchWith(bg) {
    // Set up loader
    let scratcherLoadedCount = 0;
    function onScratcherLoaded() {
      scratcherLoadedCount++;
      if (scratcherLoadedCount === scratchers.length) {
        positionCanvas();
        // Show instructions
        if (document.getElementById('loading-text')) {
          document.getElementById('loading-text').style.display = 'none';
        }
        if (document.getElementById('inst-text')) {
          document.getElementById('inst-text').style.display = 'block';
        }
      }
    }

    scratchers[0].addEventListener('imagesloaded', onScratcherLoaded);
    scratchers[0].setImages(bg, 'images/foreground.jpg');
  }

  Promise.all([
    preloadImage(backgroundImage),
    preloadImage('images/foreground.jpg')
  ]).then(() => {
    startScratchWith(backgroundImage);
  }).catch(err => {
    console.warn('preload failed for', backgroundImage, err);
    if (backgroundImage !== 'images/s2bg.jpg') {
      // if groom image failed, log it and still start with default but mark it
      console.warn('Groom image inaccessible, using default background instead');
      showMessagePanel('⚠️ Image Loading', 'Unable to load groom photo; using default image', 'warning');
      backgroundImage = 'images/s2bg.jpg';
      Promise.all([
        preloadImage(backgroundImage),
        preloadImage('images/foreground.jpg')
      ]).then(() => {
        startScratchWith(backgroundImage);
      }).catch(err2 => {
        showError('Failed to load default images: ' + err2.message);
      });
    } else {
      showError('Failed to load images: ' + err.message);
    }
  });

  // Handle scratch event
  scratchers[0].addEventListener('scratchesended', function() {
    const p = 40;
    pct = (this.fullAmount(40) * 100) | 0;

    if (!triggered && pct > p) {
      triggered = true;

      // 1. Only attempt to play sound if nosound is FALSE
      if (!nosound && soundHandle) {
          soundHandle.volume = 0.5;
                    
          if (isWinner) {
              soundHandle.src = 'audio/celebrate.mp3';
          } else {
              soundHandle.src = 'audio/lost.mp3';
          }
          
          soundHandle.currentTime = 0;
          soundHandle.play().catch(err => {
              console.log('Could not play audio:', err);
          });
      }
      // Show win message
      const instEl = document.getElementById("inst-text");
      if (instEl) {
        instEl.style.display = 'block';
        if (isWinner) {
          instEl.innerHTML = "<span class='win-message'>🎉 YOU WIN! 🎉</span>";
        } else {
          instEl.innerHTML = "<span class='lose-message'>You didn't win this time!</span>";
        }
      }
      // hide any preview images if present
    document.querySelectorAll(".images").forEach(el => el.style.display = 'none');

      scratchers[0].clear();

      // mark this player as revealed immediately so host reset is not blocked by a tab close
      updatePlayerStatus('revealed').catch(err => {
        console.error('Failed to update status on reveal:', err);
      });

      if (isWinner) {
        confetti_effect();
      }

      // wait until confetti animation completes (~10s) before showing the scratch-again button
      setTimeout(function() {
        // mark this player scratched after the event window, to avoid early reset by host
        updatePlayerStatus('scratched').catch(err => {
          console.error('Failed to update status after reveal delay:', err);
        });

        document.getElementById("resetbutton").style.display = 'block';
        if (isHost) {
          document.getElementById("reset-controls").style.display = 'block';
          document.getElementById('host-only-checkbox').style.display = 'block';
          const btn = document.getElementById("resetgamebtn");
          if (btn) {
            btn.style.display = 'inline-block';
            // button stays enabled, actual check happens on click
          }
        } else {
          // Non-host: start polling for reset detection
          startResetDetectionPolling();
        }
      }, 10500);
    }
  });

  // Reset button
  document.getElementById("resetbutton").addEventListener('click', function() {
    onResetClicked(scratchers);
  });
  // Reset game button (host only)
  const resetGameBtn = document.getElementById("resetgamebtn");
  if (resetGameBtn) {
    resetGameBtn.addEventListener('click', hostResetGame);
  }




  // Handle orientation changes
  window.addEventListener('orientationchange', function() {
    positionCanvas();
  });

  window.addEventListener('resize', function() {
    positionCanvas();
  });
}
/**
 * Generates a consistent ID based on device hardware and browser traits.
 * This remains the same even if IP changes or localStorage is cleared.
 */
function generateDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // Add unique canvas rendering traits
  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial'";
  ctx.fillText("DevicePID", 2, 2);
  const canvasData = canvas.toDataURL();
  
  // Collect stable hardware/software traits
  const traits = [
    navigator.userAgent.replace(/\d+/g, ''), // Browser type (version-agnostic)
    [screen.width, screen.height].sort().join('x'), // Screen size
    new Date().getTimezoneOffset(), // Timezone
    navigator.hardwareConcurrency || 'unknown', // CPU cores
    navigator.language
  ].join('|');
  
  // Create a simple hash of the traits + canvas data
  let str = canvasData + traits;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return 'pid_' + Math.abs(hash).toString(36);
}

function onResetClicked(scratchers) {
    // no status update on replay; keep existing _scratched state
    // (player stays scratched once scratched)

    pct = 0;
    triggered = false;
    soundHandle.pause();
    soundHandle.currentTime = 0;
    const resetBtn = document.getElementById("resetbutton");
    if (resetBtn) resetBtn.style.display = 'none';
    const resetControls = document.getElementById("reset-controls");
    if (resetControls) resetControls.style.display = 'none';
    // hide reset game while scratching again
    const resetGameBtn2 = document.getElementById("resetgamebtn");
   resetGameBtn2.style.display = "none";

    // Hide win message and show instruction
    const instEl = document.getElementById("inst-text");
    if (instEl) {
      instEl.innerHTML = "Scratch to Find the Groom!";
      instEl.style.display = 'block';
    }
    // restore any preview images
    document.querySelectorAll(".images").forEach(el => el.style.display = 'block');
    for (let i = 0; i < scratchers.length; i++) {
      scratchers[i].reset();
    }
}


// --- new helper functions for status tracking and host reset ---

/**
 * Send a status update to the server for this client.
 * @param {string} statusSuffix  e.g. 'scratched'
 */
async function updatePlayerStatus(statusSuffix) {
  if (!clientId || !gameID) return;
  const payload = new FormData();
  payload.append('action', 'updatePlayerStatus');
  payload.append('gameId', gameID);
  payload.append('clientId', clientId);
  payload.append('status', statusSuffix);

  try {
    const res = await fetch(GAS_ENDPOINT, { method: 'POST', body: payload });
    const json = await res.json();
    if (!json.success) {
      console.warn('status update failed:', json.error);
    }
  } catch (e) {
    console.warn('status update error', e);
  }
}


/**
 * Query pollGameStatus and return whether all connected players have scratched.
 * Does **not** touch the UI; callers may use the boolean result as needed.
 */
async function checkAllScratched() {
  if (!gameID) return false;
  const payload = new FormData();
  payload.append('action', 'pollGameStatus');
  payload.append('gameId', gameID);
  if (clientId) payload.append('clientId', clientId);

  try {
    const res = await fetch(GAS_ENDPOINT, { method: 'POST', body: payload });
    const json = await res.json();
    return json.success ? json.allScratched : false;
  } catch (e) {
    console.warn('Unable to check all-scratched status', e);
    return false;
  }
}

let resetDetectionIntervalId = null;

/**
 * For non-host players: starts polling to detect if the host has reset the game.
 * If gameStatus ever comes back empty, the game was reset, so reload.
 */
async function startResetDetectionPolling() {
  if (isHost || resetDetectionIntervalId) return; // only for non-hosts

  resetDetectionIntervalId = setInterval(async () => {
    if (!gameID) {
      clearInterval(resetDetectionIntervalId);
      return;
    }

    const payload = new FormData();
    payload.append('action', 'pollGameStatus');
    payload.append('gameId', gameID);
    if (clientId) payload.append('clientId', clientId);

    try {
      const res = await fetch(GAS_ENDPOINT, { method: 'POST', body: payload });
      const json = await res.json();
      if (json.success) {
        // if status is empty at any point, assume reset
        if (!json.gameStatus) {
          console.log("Game reset detected by non-host player, reloading...");
          clearInterval(resetDetectionIntervalId);
          window.location.reload();
        }
      }
    } catch (e) {
      console.warn('Reset detection poll error:', e);
    }
  }, 2000);
}

/**
 * Called when host clicks "Reset Game" button.
 */
async function hostResetGame() {
  // double-check on server side that every connected player has scratched
  const everyoneDone = await checkAllScratched();
  if (!everyoneDone) {
    showMessagePanel('⚠️ Cannot Reset', 'Not all players have finished scratching yet. Please wait for everyone to reveal their result.', 'error');
    return;
  }

  const clearHostCheckbox = document.getElementById('reset-clear-host');
  const clearHost = clearHostCheckbox && clearHostCheckbox.checked;

  const payload = new FormData();
  payload.append('action', 'resetGame');
  payload.append('gameId', gameID);
  if (clientId) payload.append('clientId', clientId);
  payload.append('clearHost', clearHost ? 'true' : 'false');

  try {
    const res = await fetch(GAS_ENDPOINT, { method: 'POST', body: payload });
    const json = await res.json();
    if (json.success) {
      showMessagePanel('✅ Game Reset', 'Game has been reset successfully', 'info');
      // reload so everyone has to rejoin
      window.location.reload();
    } else {
      if (json.error && json.error.indexOf('Cannot reset until all players') === 0) {
        showMessagePanel('⚠️ Cannot Reset', json.error, 'error');
      } else {
        showMessagePanel('❌ Error', json.error || 'Failed to reset game', 'error');
      }
    }
  } catch (e) {
    showMessagePanel('❌ Error', 'Reset error: ' + e.message, 'error');
  }
}
/**
 * Position and size the canvas
 */
    function positionCanvas() {
    
   
            // Use media query to match CSS orientation logic
            const isLandscape = window.matchMedia('(orientation: landscape) and (max-width: 1023px)').matches;
            let factor=1;
            const screenHeight = window.visualViewport.height || window.innerHeight;
            const screenWidth = window.visualViewport.width|| window.innerWidth;
            //console.log("screen " + screenHeight + " " + screenWidth);
            let scaledImageHeight, scaledImageWidth, imageLeftOffset, imageTopOffset,canvasX, canvasY;
            let scale;
            if (isLandscape) {
                originalWidth = LANDSCAPE_IMAGE_WIDTH;
                originalHeight = LANDSCAPE_IMAGE_HEIGHT;
                targetX = LANDSCAPE_SCRATCHER_X;
                targetY = LANDSCAPE_SCRATCHER_Y;
                factor=1.5;
                scale = screenWidth / originalWidth;
                scaledImageWidth = screenWidth;
                scaledImageHeight = originalHeight * scale;
                imageLeftOffset = 0;
                imageTopOffset = (screenHeight - scaledImageHeight) / 2;
                canvasX = imageLeftOffset + targetX * scale;
                canvasY = imageTopOffset + targetY * scale;
            } else {
                originalWidth = PORTRAIT_IMAGE_WIDTH;
                originalHeight = PORTRAIT_IMAGE_HEIGHT;
                targetX = PORTRAIT_SCRATCHER_X;
                targetY = PORTRAIT_SCRATCHER_Y;
                factor=1.17;
                scale = screenHeight / originalHeight;
                scaledImageWidth = originalWidth * scale;
                scaledImageHeight = screenHeight;
                imageLeftOffset = (screenWidth - scaledImageWidth) / 2;
                imageTopOffset = 0;
                canvasX = imageLeftOffset + targetX * scale;
                canvasY = imageTopOffset + targetY * scale;
            }
                scratcher.style.left = `${canvasX}px`;
                scratcher.style.top = `${canvasY}px`;
                //alert();
                //alert("screen " + screenHeight);
                // Optionally scale canvas size too
                    // Always use the original canvas size for scaling
                scratcher.width = canvasOriginalWidth * scale * factor;
                scratcher.height = canvasOriginalHeight * scale * factor;

                // For iOS safe area
                scratcher.style.height = `calc(${scratcher.height}px - constant(safe-area-inset-bottom))`;
                scratcher.style.height = `calc(${scratcher.height}px - env(safe-area-inset-bottom))`; 
                
                if(scratchers[0]){ 
                    if (triggered) {
                    scratchers[0].resetnoclear(true);
                } else {
                    scratchers[0].resetnoclear(false);
                }   
                }

      }

/**
 * Confetti effect for winners
 */
function confetti_effect() {
  if (triggered !== true) return;

  const duration = 10 * 1000;
  const end = Date.now() + duration;
  const defaults = { startVelocity: 10, spread: 360, ticks: 70, zIndex: 0 };
  const particleCount = 5;

  (function frame() {
    confetti({
      ...defaults,
      particleCount,
      origin: { x: Math.random() * 0.2 + 0.1, y: Math.random() - 0.2 },
      colors: [colortxt]
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: Math.random() * 0.2 + 0.7, y: Math.random() - 0.2 },
      colors: [colortxt]
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}
