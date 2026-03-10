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

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async function() {
  // persistent client id for reconnect logic
  clientId = localStorage.getItem('scratchClientId');
  if (!clientId) {
    clientId = 'pid_' + Math.random().toString(36).substr(2,9);
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

    // Wait in lobby for host to start the game or for any other changes
    showLoading("Entering lobby...");
    await waitInLobby();

    // All players connected and game started - initialize game
    showLoading("Initializing game...");
    initPage();

  } catch (err) {
    // registration or initialization failed
    showError("Error: " + err.message);
    CrispyToast.error(err.message);
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
  
  console.log("Player registered: playerNum=" + playerNum + ", isHost=" + isHost + ", isWinner=" + isWinner);
}

/**
 * Wait in the lobby for the host to start the game or for any status changes
 */
async function waitInLobby() {
  const maxWaitTime = 60 * 60 * 1000; // 60 minutes max
  const startTime = Date.now();
  const pollInterval = 1500; // 1.5 seconds
  
  // Show appropriate message
  if (isHost) {
    showLoading("Waiting for players...");
    showHostControlPanel();
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
        
        // Update winnerIndex if it changed
        if (newWinnerIndex !== gameData.winnerIndex) {
          gameData.winnerIndex = newWinnerIndex;
          isWinner = (playerNum === newWinnerIndex);
          console.log("Winner index updated to: " + newWinnerIndex);
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
            // I became the host!
            isHost = true;
            showHostControlPanel();
            CrispyToast.success("You are now the host!");
            console.log("Promoted to host");
          } else if (isHost && json.hostClientId !== clientId) {
            // I was demoted (shouldn't happen, but handle it)
            isHost = false;
            hideHostControlPanel();
            CrispyToast.warning("Host role transferred");
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
        if (json.gameStarted) {
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
      CrispyToast.success("Game started!");
      gameStarted = true;
      allPlayersConnected = true;
      // The lobby loop will detect the change and exit
    } else {
      CrispyToast.error(json.error || "Failed to start game");
      if (statusMsg) statusMsg.textContent = "Error: " + (json.error || "Failed");
    }
  } catch (err) {
    CrispyToast.error("Error: " + err.message);
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
    CrispyToast.warning("Max players must be between 1 and 20");
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
        CrispyToast.info("Reduced limit. " + json.droppedCount + " player(s) removed");
      }
      
      if (statusMsg) statusMsg.textContent = "Max: " + newMax;
      setTimeout(() => {
        if (statusMsg) statusMsg.textContent = "";
      }, 2000);
    } else {
      CrispyToast.error(json.error || "Failed to update");
      if (statusMsg) statusMsg.textContent = "Error: " + (json.error || "Failed");
    }
  } catch (err) {
    CrispyToast.error("Error: " + err.message);
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
function initPage() {
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

  document.getElementById("id01").style.display = 'block';
  
  // Groom name display
  const babyEl = document.getElementById("baby");
  if (babyEl) babyEl.textContent = 'Baby ' + gameData.groomName;
  const surnameEl = document.getElementById("surname");
  if (surnameEl) surnameEl.textContent = gameData.groomName;

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
    soundHandle.src = 'audio/celebrate.mp3';
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
      CrispyToast.warning('Unable to load groom photo; using default image');
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
    const p = 25;
    pct = (this.fullAmount(40) * 100) | 0;

    if (!triggered && pct > p) {
      triggered = true;

      // Play sound only for winners
      if (isWinner && !nosound && soundHandle) {
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

/* 
      document.getElementById("boy").style.display = 'none';
      document.getElementById("or").style.display = 'none';
      document.getElementById("girl").style.display = 'none';
      document.getElementById("H3").style.display = 'none';
      document.getElementById("H4").style.display = 'none'; */

      scratchers[0].clear();

      if (isWinner) {
        confetti_effect();
      }

      setTimeout(function() {
        document.getElementById("resetbutton").style.display = 'block';
      }, 2000);
    }
  });

  // Reset button
  document.getElementById("resetbutton").addEventListener('click', function() {
    onResetClicked(scratchers);
  });

function onResetClicked(scratchers) {
    pct = 0;
    triggered = false;
    soundHandle.pause();
    soundHandle.currentTime = 0;
    const resetBtn = document.getElementById("resetbutton");
    if (resetBtn) resetBtn.style.display = 'none';
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

  // Handle orientation changes
  window.addEventListener('orientationchange', function() {
    positionCanvas();
  });

  window.addEventListener('resize', function() {
    positionCanvas();
  });
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
  if (!nosound) {
    soundHandle.volume = 0.5;
    soundHandle.play();
  }

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
