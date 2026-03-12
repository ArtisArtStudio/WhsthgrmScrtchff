/**
 * Code.gs — Scratch-Off Game Backend
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Apps Script Web App
 *
 * Responsibilities:
 *   1. Receive multipart FormData POST from admin.html
 *   2. Create a Game folder in Google Drive
 *   3. Upload groom image to that folder
 *   4. Log game metadata to a Google Sheet
 *   5. Return JSON with { success, gameId, gameLink } or { success: false, error }
 *
 * Deploy as:  Execute as → Me  |  Who has access → Anyone
 * ─────────────────────────────────────────────────────────────────────────────
 */


// ─── CONFIG — fill these in before deploying ─────────────────────────────────

const CONFIG = {
  // Google Drive folder ID where all game sub-folders will be created.
  // Open the parent folder in Drive → copy the ID from the URL:
  //   https://drive.google.com/drive/folders/THIS_PART_HERE
  PARENT_FOLDER_ID: "1dGuMCfSTLPCekeunDw5kiMawJ8y0Tkse",

  // Google Sheets spreadsheet ID for the game registry.
  // Open the sheet → copy the ID from the URL:
  //   https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
  SHEET_ID: "1EdR3dPHXcKN2NGPW3tYhprgq8b8B3OxsdWU4v5NpYow",

  // Name of the sheet tab to write game records into.
  SHEET_TAB: "Games",

  // Your GitHub Pages game base URL (no trailing slash).
  //GAME_BASE_URL: "https://YOUR_USERNAME.github.io/YOUR_REPO",
};


// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

/**
 * doPost(e)
 * Called by Google's infrastructure when the Web App receives a POST request.
 * Routes based on the `action` parameter in the FormData payload.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}  JSON response
 */
function doPost(e) {
  try {
    const action = e.parameter.action;
    Logger.log("=== REMOTE EXECUTION START ===");
    Logger.log("action: " + action);
    Logger.log("All parameters: " + JSON.stringify(Object.keys(e.parameter)));

    if (action === "createGame") {
      return handleCreateGame(e);
    } else if (action === "getGameData") {
      return handleGetGameData(e);
    } else if (action === "registerPlayer") {
      return handleRegisterPlayer(e);
    } else if (action === "startGame") {
      return handleStartGame(e);
    } else if (action === "updateMaxPlayers") {
      return handleUpdateMaxPlayers(e);
    } else if (action === "pollGameStatus") {
      return handlePollGameStatus(e);
    } else if (action === "updatePlayerStatus") {
      return handleUpdatePlayerStatus(e);
    } else if (action === "resetGame") {
      return handleResetGame(e);
    } else if (action === "updateGameFinished") {
      return handleUpdateGameFinished(e);
    } else if (action === "checkHostStatus") {
      return handleCheckHostStatus(e);
    }

    return jsonResponse({ success: false, error: "Unknown action: " + action });

  } catch (err) {
    // Top-level safety net — always return valid JSON even on unexpected errors
    Logger.log("FATAL ERROR in doPost: " + err.message);
    Logger.log("Stack: " + err.stack);
    return jsonResponse({ success: false, error: err.message, details: err.stack });
  }
}

/**
 * doGet(e)
 * Handles GET requests — useful for a health check during setup.
 * Visit the /exec URL directly in a browser to confirm the script is live.
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Scratch Game GAS backend is live." }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ─── HANDLER ─────────────────────────────────────────────────────────────────

/**
 * handleCreateGame(e)
 * Main business logic for creating a new game.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function handleCreateGame(e) {
  // ── 1. Parse text parameters from the FormData payload ────────────────────
  // Text fields are always available via e.parameter (singular).
  var gameId      = e.parameter.gameId;
  var maxPlayers  = parseInt(e.parameter.maxPlayers, 10);
  var winnerIndex = parseInt(e.parameter.winnerIndex, 10);
  var createdAt   = new Date().toISOString();

  // Basic validation
  if (!gameId)            throw new Error("Missing gameId");
  if (isNaN(maxPlayers))  throw new Error("Invalid maxPlayers");
  if (isNaN(winnerIndex)) throw new Error("Invalid winnerIndex");
  
  var groomName = e.parameter.groomName || "Unknown";

  // Debug logging
  Logger.log("=== CREATE GAME ===");
  Logger.log("gameId: " + gameId);
  Logger.log("groomName: " + groomName);
  Logger.log("maxPlayers: " + maxPlayers);
  Logger.log("winnerIndex: " + winnerIndex);
  Logger.log("e.parameter keys: " + Object.keys(e.parameter).join(", "));

  // ── 2. Create a dedicated folder for this game in Google Drive ────────────
  var parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  var gameFolder   = parentFolder.createFolder(gameId);
  var gameFolderId = gameFolder.getId();
  Logger.log("Created folder: " + gameFolderId);

  // ── 3. Upload groom image to the game folder ──────────────────────────────
  var groomUrl = null;
  var groomFileId = null;
  
  // Try to get base64-encoded image from new method
  var base64Image = e.parameter.groomImageBase64;
  var imageName = e.parameter.groomImageName || "groom.jpg";
  var imageType = e.parameter.groomImageType || "image/jpeg";
  
  if (base64Image) {
    Logger.log("Received base64 image, length: " + base64Image.length);
    var uploadResult = uploadBase64ToGDrive(base64Image, imageName, imageType, gameFolder);
    groomUrl = uploadResult.url;
    groomFileId = uploadResult.fileId;
  } else {
    // Fallback to old multipart method
    Logger.log("No base64 image, trying multipart blob...");
    var uploadResult = uploadFileToDrive(e, "groomImage", gameFolder);
    groomUrl = uploadResult.url;
    groomFileId = uploadResult.fileId;
  }
  
  Logger.log("groomUrl: " + groomUrl);
  Logger.log("groomFileId: " + groomFileId);

  // ── 4. Make the game folder publicly readable ─────────────────────────────
  // Required so the player frontend can load images without authentication.
  gameFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // ── 5. Write game-meta.json into the game folder ──────────────────────────
  // The player frontend fetches this file to learn the winner index and image URLs.
  var metadata = {
    gameId:      gameId,
    maxPlayers:  maxPlayers,
    winnerIndex: winnerIndex,
    createdAt:   createdAt,
    images: {
      groom: groomUrl
    }
  };

  var metaBlob = Utilities.newBlob(
    JSON.stringify(metadata, null, 2),
    "application/json",
    "game-meta.json"
  );
  var metaFile   = gameFolder.createFile(metaBlob);
  metaFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var metaFileId = metaFile.getId();

  // ── 6. Log the game record to Google Sheets ───────────────────────────────
  logToSheet({
    gameId:       gameId,
    name:         groomName,
    maxPlayers:   maxPlayers,
    winnerIndex:  winnerIndex,
    createdAt:    createdAt,
    gameFolderId: gameFolderId,
    metaFileId:   metaFileId,
    groomUrl:     groomUrl,
    groomFileId:  groomFileId
  });

  // ── 7. Return the public game link ────────────────────────────────────────
  //var gameLink = CONFIG.GAME_BASE_URL + "/?game=" + gameId;

  return jsonResponse({
    success:     true,
    gameId:      gameId,
    gameFolderId: gameFolderId,
    metaFileId:  metaFileId,
    metaUrl:     "https://drive.google.com/uc?id=" + metaFileId,
    groomUrl:    groomUrl,
    debug: {
      blobReceived: e.parameter.groomImage ? true : false,
      blobType: typeof e.parameter.groomImage,
      blobName: e.parameter.groomImage ? e.parameter.groomImage.getName() : null,
      allParams: Object.keys(e.parameter)
    }
  });
}


/**
 * handleGetGameData(e)
 * Retrieves game data from the spreadsheet for a specific gameId.
 * Returns game metadata and player connection status.
 * If the requesting player is the winner, includes groomBase64.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function handleGetGameData(e) {
  var gameId = e.parameter.gameId;
  var playerNum = parseInt(e.parameter.playerNum, 10) || null;
  
  if (!gameId) {
    return jsonResponse({ success: false, error: "Missing gameId" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRow = null;
    var gameRowIndex = -1;

    // Find the game row
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRow = data[i];
        gameRowIndex = i;
        break;
      }
    }

    if (!gameRow) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // Fetch groomUrl from meta file
    var groomUrl = null;
    var metaFileId = gameRow[6];
    if (metaFileId) {
      try {
        var metaFile = DriveApp.getFileById(metaFileId);
        var metaContent = metaFile.getBlob().getDataAsString();
        var metadata = JSON.parse(metaContent);
        groomUrl = metadata.images ? metadata.images.groom : null;
      } catch (err) {
        Logger.log("Error fetching meta for groomUrl: " + err.message);
      }
    }

    // If this player is the winner, fetch and encode the groom image as base64
    var groomBase64 = null;
    var groomMimeType = null;
    if (playerNum && playerNum === gameRow[3]) {  // gameRow[3] is winnerIndex (1-based)
      if (groomUrl) {
        try {
          // Extract file ID from groomUrl: https://drive.google.com/uc?id=FILE_ID&export=view
          var urlParts = groomUrl.split('id=');
          if (urlParts.length > 1) {
            var fileId = urlParts[1].split('&')[0];
            var file = DriveApp.getFileById(fileId);
            var blob = file.getBlob();
            groomBase64 = Utilities.base64Encode(blob.getBytes());
            groomMimeType = blob.getContentType();
            Logger.log("Encoded groom image for winner: " + groomBase64.substring(0, 50) + "...");
          }
        } catch (err) {
          Logger.log("Error encoding groom image: " + err.message);
        }
      }
    }

    // Extract game data
    var gameData = {
      gameId:      gameRow[0],
      groomName:   gameRow[1],
      maxPlayers:  gameRow[2],
      winnerIndex: gameRow[3],
      createdAt:   gameRow[4],
      hostClientId: gameRow[7] || "",  // Column 8 (index 7): hostClientId
      gameStatus:  gameRow[8] || "",  // Column 9 (index 8): gameStatus
      groomUrl:    groomUrl,
      groomBase64: groomBase64,
      groomMimeType: groomMimeType,
      connectedPlayers: 0,
      playerStatus: {}
    };

    // Count connected players and record identifier strings
    for (var p = 0; p < 20; p++) {
      var playerColIndex = 9 + p; // Players start at column 10 (array index 9)
      var playerNumLoop = p + 1;
      var status = gameRow[playerColIndex] || "";
      gameData.playerStatus["player" + playerNumLoop] = status;
      if (status !== "") {
        gameData.connectedPlayers++;
      }
    }

    return jsonResponse({
      success: true,
      data: gameData
    });

  } catch (err) {
    Logger.log("ERROR in handleGetGameData: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleUpdatePlayerStatus(e)
 * Updates the player column value by appending a status suffix
 * (e.g. pid_xxx_scratched or pid_xxx_replay). Used to track when
 * a user finishes scratching or replays the game.
 */
function handleUpdatePlayerStatus(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId;
  var status = e.parameter.status; // e.g. "scratched" or "replay"

  if (!gameId || !clientId || !status) {
    return jsonResponse({ success: false, error: "Missing parameters" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRowIndex = i;
        break;
      }
    }

    if (gameRowIndex === -1) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // locate player's cell
    for (var p = 0; p < 20; p++) {
      var colIndex = 9 + p;
      var val = data[gameRowIndex][colIndex];
      if (val && val.toString().indexOf(clientId) === 0) {
        // update with suffix
        var newVal = clientId + "_" + status;
        sheet.getRange(gameRowIndex+1, colIndex+1).setValue(newVal);
        return jsonResponse({ success: true });
      }
    }

    // if we didn't find the clientId, still return success (no-op)
    return jsonResponse({ success: true });
  } catch (err) {
    Logger.log("ERROR in handleUpdatePlayerStatus: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleResetGame(e)
 * Only the host may call this. Clears all player slots and resets
 * gameStarted/hostClientId in the sheet so new clients can join.
 */
function handleResetGame(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId;

  if (!gameId || !clientId) {
    return jsonResponse({ success: false, error: "Missing parameters" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRow = null;
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRow = data[i];
        gameRowIndex = i;
        break;
      }
    }

    if (!gameRow) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // only host allowed
    var hostId = gameRow[7] || "";
    if (hostId !== clientId) {
      return jsonResponse({ success: false, error: "Unauthorized" });
    }

    // verify all connected players have scratched before allowing reset
    var connectedPlayers = 0;
    var scratchedCount = 0;
    for (var p = 0; p < 20; p++) {
      var val = gameRow[9 + p] || ""; // player columns start at index 9
      if (val !== "") {
        connectedPlayers++;
        // treat only explicit status suffixes as scratched
        if (/_((scratched)|(replay))$/.test(val)) {
          scratchedCount++;
        }
      }
    }
    if (connectedPlayers > 0 && scratchedCount !== connectedPlayers) {
      return jsonResponse({ success: false, error: "Cannot reset until all players have scratched" });
    }

    // clear player cells
    var clearValues = [];
    for (var p = 0; p < 20; p++) {
      clearValues.push([""]);
    }
    sheet.getRange(gameRowIndex+1, 10, 1, 20).setValues([clearValues.map(function(v){return v[0];})]);

    // clear hostClientId and gameStatus
    sheet.getRange(gameRowIndex+1, 8).setValue("");
    sheet.getRange(gameRowIndex+1, 9).setValue("");

    // randomize winnerIndex within the allowed range (1 to maxPlayers)
    var maxPlayers = parseInt(gameRow[2], 10);
    var newWinnerIndex = Math.floor(Math.random() * maxPlayers) + 1;
    sheet.getRange(gameRowIndex+1, 4).setValue(newWinnerIndex);
    Logger.log("Game " + gameId + " reset: new winnerIndex = " + newWinnerIndex);

    return jsonResponse({ success: true });
  } catch (err) {
    Logger.log("ERROR in handleResetGame: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleRegisterPlayer(e)
 * Registers a player connection for a specific gameId.
 * First player to connect becomes the host.
 * Finds the first empty player column and writes the clientId to it.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function handleRegisterPlayer(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId || "";
  
  if (!gameId) {
    return jsonResponse({ success: false, error: "Missing gameId" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRowIndex = -1;

    // Find the game row
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRowIndex = i + 1; // Sheets are 1-indexed
        break;
      }
    }

    if (gameRowIndex === -1) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // Check if this clientId already has a slot
    var playerNum = -1;
    var currentCount = 0;
    for (var p = 0; p < 20; p++) {
      var playerColIndex = 9 + p; // Players start at column 10 (array index 9)
      var cellValue = data[gameRowIndex - 1][playerColIndex] || "";
      if (cellValue !== "") {
        currentCount++;
        if (cellValue === clientId && clientId !== "") {
          playerNum = p + 1;
          break;
        }
      }
    }

    // if already registered, just return existing number and host status
    if (playerNum !== -1) {
      var hostClientId = data[gameRowIndex - 1][7] || "";
      var isHost = (clientId === hostClientId);
      return jsonResponse({ success: true, playerNum: playerNum, isHost: isHost });
    }

    // if game is full, refuse
    var maxPlayers = parseInt(sheet.getRange(gameRowIndex, 3).getValue(), 10);
    if (currentCount >= maxPlayers) {
      return jsonResponse({ success: false, error: "Game is full" });
    }

    // Check if this is the first player (becomes host)
    var isFirstPlayer = (currentCount === 0);
    var hostClientId = data[gameRowIndex - 1][7] || "";  // Column 8 = hostClientId
    var isHost = false;

    if (isFirstPlayer) {
      // Mark this player as host
      sheet.getRange(gameRowIndex, 8).setValue(clientId);  // Column 8 = hostClientId
      isHost = true;
      Logger.log("First player for game " + gameId + " marked as host: " + clientId);
    }

    // otherwise assign a new slot
    for (var p = 0; p < 20; p++) {
      var playerColIndex2 = 9 + p; // Players start at column 10 (array index 9)
      var cellVal2 = data[gameRowIndex - 1][playerColIndex2] || "";
      if (cellVal2 === "") {
        playerNum = p + 1;
        sheet.getRange(gameRowIndex, playerColIndex2 + 1).setValue(clientId || "connected");
        Logger.log("Player registered for game " + gameId + ": player" + playerNum + " id=" + clientId + " isHost=" + isHost);
        break;
      }
    }

    return jsonResponse({
      success: true,
      playerNum: playerNum,
      isHost: isHost
    });

  } catch (err) {
    Logger.log("ERROR in handleRegisterPlayer: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleStartGame(e)
 * Called by the host to start the game.
 * Sets the gameStarted flag in the sheet.
 */
function handleStartGame(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId;
  
  if (!gameId || !clientId) {
    return jsonResponse({ success: false, error: "Missing gameId or clientId" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRowIndex = i + 1;
        break;
      }
    }

    if (gameRowIndex === -1) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // Verify the requester is the host
    var hostClientId = data[gameRowIndex - 1][7] || "";  // Column H (index 7): hostClientId
    if (hostClientId !== clientId) {
      return jsonResponse({ success: false, error: "Only the host can start the game" });
    }

    // Set gameStatus to "Started"
    sheet.getRange(gameRowIndex, 9).setValue("Started");  // Column I (index 8): gameStatus
    SpreadsheetApp.flush(); // Ensure the change is written immediately
    
    // Verify the value was set
    var setValue = sheet.getRange(gameRowIndex, 10).getValue();
    Logger.log("Game " + gameId + " started by host " + clientId + ", set value: " + setValue);

    return jsonResponse({ success: true });

  } catch (err) {
    Logger.log("ERROR in handleStartGame: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleUpdateMaxPlayers(e)
 * Called by the host to change the maximum number of players.
 * If the new limit is lower than current connected players,
 * the extra players are marked as inactive.
 */
function handleUpdateMaxPlayers(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId;
  var newMaxPlayers = parseInt(e.parameter.newMaxPlayers, 10);
  
  if (!gameId || !clientId || isNaN(newMaxPlayers)) {
    return jsonResponse({ success: false, error: "Missing or invalid parameters" });
  }

  if (newMaxPlayers < 1 || newMaxPlayers > 20) {
    return jsonResponse({ success: false, error: "Max players must be between 1 and 20" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRowIndex = i + 1;
        break;
      }
    }

    if (gameRowIndex === -1) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // Verify the requester is the host
    var hostClientId = data[gameRowIndex - 1][9] || "";
    if (hostClientId !== clientId) {
      return jsonResponse({ success: false, error: "Only the host can update max players" });
    }

    // Update maxPlayers in the sheet
    sheet.getRange(gameRowIndex, 3).setValue(newMaxPlayers);

    // If reducing maxPlayers, mark extra players as inactive
    var connectedCount = 0;
    var playerIndices = [];
    for (var p = 0; p < 20; p++) {
      var playerColIndex = 9 + p;  // Players start at column 10 (array index 9)
      var playerVal = data[gameRowIndex - 1][playerColIndex] || "";
      if (playerVal !== "") {
        connectedCount++;
        playerIndices.push(p);
      }
    }

    if (connectedCount > newMaxPlayers) {
      // Mark the most recently joined players as inactive (clear them from the sheet)
      for (var i = newMaxPlayers; i < connectedCount; i++) {
        var excessIndex = playerIndices[i];
        sheet.getRange(gameRowIndex, excessIndex + 10).setValue("");  // Column 10+ = players
        Logger.log("Marked player slot " + (excessIndex + 1) + " as inactive");
      }
    }

    // Also recalculate winnerIndex if it exceeds new maxPlayers
    var currentWinnerIndex = parseInt(data[gameRowIndex - 1][3], 10);
    if (currentWinnerIndex > newMaxPlayers) {
      var newWinnerIndex = Math.floor(Math.random() * newMaxPlayers) + 1;
      sheet.getRange(gameRowIndex, 4).setValue(newWinnerIndex);
      Logger.log("Recalculated winnerIndex from " + currentWinnerIndex + " to " + newWinnerIndex);
    }

    return jsonResponse({ 
      success: true, 
      newMaxPlayers: newMaxPlayers,
      droppedCount: Math.max(0, connectedCount - newMaxPlayers)
    });

  } catch (err) {
    Logger.log("ERROR in handleUpdateMaxPlayers: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handlePollGameStatus(e)
 * Polls the current game status including:
 * - gameStarted flag
 * - maxPlayers
 * - hostClientId
 * - connected players count
 * All clients poll this regularly to get real-time updates
 */
function handlePollGameStatus(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId;
  
  if (!gameId) {
    return jsonResponse({ success: false, error: "Missing gameId" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRow = null;
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRow = data[i];
        gameRowIndex = i;
        break;
      }
    }

    if (!gameRow) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // Count connected players and determine how many have a status suffix
    var connectedPlayers = 0;
    var scratchedCount = 0;
    var playerIsActive = false;
    for (var p = 0; p < 20; p++) {
      var playerColIndex = 9 + p;  // Players start at column 10 (array index 9)
      var playerVal = gameRow[playerColIndex] || "";
      if (playerVal !== "") {
        connectedPlayers++;
        if (/_((scratched)|(replay))$/.test(playerVal)) {
          scratchedCount++;
        }
        if (playerVal.indexOf(clientId) === 0) {
          playerIsActive = true;
        }
      }
    }

    var hostClientId = gameRow[7] || "";  // Column H (index 7): hostClientId
    var gameStatus = gameRow[8] || "";  // Column I (index 8): gameStatus
    var maxPlayers = parseInt(gameRow[2], 10);
    var winnerIndex = parseInt(gameRow[3], 10);

    var allScratched = connectedPlayers > 0 && scratchedCount === connectedPlayers;

    return jsonResponse({
      success: true,
      gameStatus: gameStatus,
      maxPlayers: maxPlayers,
      winnerIndex: winnerIndex,
      hostClientId: hostClientId,
      connectedPlayers: connectedPlayers,
      playerIsActive: playerIsActive,  // False if this player was kicked from lobby
      allScratched: allScratched
    });

  } catch (err) {
    Logger.log("ERROR in handlePollGameStatus: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleUpdateGameFinished(e)
 * Called to mark a game as finished (after all players have scratched).
 * Sets gameStatus to "Finished".
 */
function handleUpdateGameFinished(e) {
  var gameId = e.parameter.gameId;
  var clientId = e.parameter.clientId;
  
  if (!gameId || !clientId) {
    return jsonResponse({ success: false, error: "Missing parameters" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRowIndex = i;
        break;
      }
    }

    if (gameRowIndex === -1) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    // Only host can update game finished status
    var hostClientId = data[gameRowIndex][7] || "";  // Column H (index 7): hostClientId
    if (hostClientId !== clientId) {
      return jsonResponse({ success: false, error: "Only the host can finish the game" });
    }

    // Set gameStatus to "Finished"
    sheet.getRange(gameRowIndex + 1, 9).setValue("Finished");  // Column I (index 8): gameStatus
    SpreadsheetApp.flush();
    
    Logger.log("Game " + gameId + " marked as finished");
    return jsonResponse({ success: true });

  } catch (err) {
    Logger.log("ERROR in handleUpdateGameFinished: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


/**
 * handleCheckHostStatus(e)
 * Checks if the host is still active.
 * If not, promotes the earliest connected player as the new host.
 */
function handleCheckHostStatus(e) {
  var gameId = e.parameter.gameId;
  
  if (!gameId) {
    return jsonResponse({ success: false, error: "Missing gameId" });
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var data = sheet.getDataRange().getValues();
    var gameRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === gameId) {
        gameRowIndex = i + 1;
        break;
      }
    }

    if (gameRowIndex === -1) {
      return jsonResponse({ success: false, error: "Game not found" });
    }

    var currentHostClientId = data[gameRowIndex - 1][7] || "";  // Column 8 = hostClientId
    
    // Check if current host is still in the players list
    var hostStillActive = false;
    for (var p = 0; p < 20; p++) {
      var playerColIndex = 9 + p;  // Players start at column 10 (array index 9)
      var playerVal = data[gameRowIndex - 1][playerColIndex] || "";
      if (playerVal === currentHostClientId) {
        hostStillActive = true;
        break;
      }
    }

    if (!hostStillActive && currentHostClientId !== "") {
      // Host disconnected, promote the first connected player
      var newHostClientId = null;
      for (var p = 0; p < 20; p++) {
        var playerColIndex = 9 + p;  // Players start at column 10 (array index 9)
        var playerVal = data[gameRowIndex - 1][playerColIndex] || "";
        if (playerVal !== "") {
          newHostClientId = playerVal;
          break;
        }
      }

      if (newHostClientId) {
        sheet.getRange(gameRowIndex, 8).setValue(newHostClientId);  // Column 8 = hostClientId
        Logger.log("Promoted new host for game " + gameId + ": " + newHostClientId);
        
        return jsonResponse({
          success: true,
          hostChanged: true,
          newHostClientId: newHostClientId
        });
      }
    }

    return jsonResponse({
      success: true,
      hostChanged: false,
      currentHostClientId: currentHostClientId
    });

  } catch (err) {
    Logger.log("ERROR in handleCheckHostStatus: " + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}


// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * uploadBase64ToGDrive(base64String, fileName, mimeType, folder)
 * Decodes a base64-encoded file and uploads it to Drive.
 * This method is more reliable than binary file uploads with Google Apps Script.
 *
 * @param {string} base64String - Base64-encoded file data (without data URI prefix)
 * @param {string} fileName - Name for the file
 * @param {string} mimeType - MIME type (e.g., "image/jpeg")
 * @param {GoogleAppsScript.Drive.Folder} folder - Target folder
 * @returns {string|null} - Public URL or null if failed
 */
function uploadBase64ToGDrive(base64String, fileName, mimeType, folder) {
  try {
    Logger.log("uploadBase64ToGDrive: fileName=" + fileName + ", mimeType=" + mimeType);
    
    // Decode base64 to blob
    var decoded = Utilities.base64Decode(base64String);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    
    Logger.log("Decoded blob size: " + blob.getBytes().length);
    
    // Upload to Drive
    var file = folder.createFile(blob);
    
    // Set sharing permissions - try multiple approaches for reliability
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log("Warning: setSharing failed: " + shareErr.message);
    }
    
    // Also try setting sharing on the parent folder if needed
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (folderErr) {
      Logger.log("Warning: folder sharing failed: " + folderErr.message);
    }
    
    var fileUrl = "https://drive.google.com/uc?id=" + file.getId() + "&export=view";
    Logger.log("Base64 file uploaded successfully: " + fileUrl);
    Logger.log("File sharing set to: " + file.getSharingAccess() + " / " + file.getSharingPermission());
    
    return { url: fileUrl, fileId: file.getId() };
  } catch (err) {
    Logger.log("ERROR in uploadBase64ToGDrive: " + err.message);
    return { url: null, fileId: null };
  }
}


/**
 * uploadFileToDrive(e, fieldName, folder)
 * Uploads a single file from the FormData payload to a Drive folder.
 * Returns the public direct-download URL, or null if the field is absent.
 *
 * HOW GAS HANDLES MULTIPART FILE UPLOADS:
 *   Both text fields AND file blobs are accessed via e.parameter[key] (singular).
 *   e.parameters (plural) is an object of string arrays for text fields only —
 *   file blobs are never present there. GAS parses the multipart boundary
 *   automatically and hands you the Blob object directly via e.parameter.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @param {string} fieldName          FormData field name (e.g. "groomImage")
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @returns {string|null}
 */
function uploadFileToDrive(e, fieldName, folder) {
  // Try e.parameters first (plural) - this is sometimes more reliable for files
  var blob = null;
  
  if (e.parameters && e.parameters[fieldName] && e.parameters[fieldName].length > 0) {
    blob = e.parameters[fieldName][0];
  }
  
  // Fallback to e.parameter (singular)
  if (!blob) {
    blob = e.parameter[fieldName];
  }

  // If still no blob, try checking if it exists as a string (filename only)
  if (!blob && e.parameter[fieldName] && typeof e.parameter[fieldName] === "string") {
    // Sometimes GAS stores just the filename, not the blob
    return { url: null, fileId: null };
  }

  if (!blob || typeof blob === "string") {
    return { url: null, fileId: null };
  }

  // Preserve the original filename the browser sent.
  var originalName = blob.getName() || fieldName;
  blob.setName(originalName);

  // Write the blob to Drive and make it publicly readable.
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Return a URL the game frontend can use directly as an <img> src.
  var fileUrl = "https://drive.google.com/uc?id=" + file.getId();
  return { url: fileUrl, fileId: file.getId() };
}


function logToSheet(record) {
  var ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);

  // Create the tab if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_TAB);
  }

  // Check and update headers if necessary
  if (sheet.getLastRow() > 0) {
    var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var hasGroomFileId = currentHeaders.length >= 9 && currentHeaders[8] === "groomFileId";
    if (!hasGroomFileId) {
      // Insert groomFileId column after groomUrl (column 8)
      sheet.insertColumnAfter(8);
      sheet.getRange(1, 9).setValue("groomFileId");
      sheet.getRange(1, 9).setFontWeight("bold");
    }
    var hasGameStatus = currentHeaders.length >= 10 && currentHeaders[9] === "gameStatus";
    if (!hasGameStatus) {
      // Insert gameStatus column after gameStarted (column 9)
      sheet.insertColumnAfter(9);
      sheet.getRange(1, 10).setValue("gameStatus");
      sheet.getRange(1, 10).setFontWeight("bold");
    }
  }

  // Write column headers on very first use
  if (sheet.getLastRow() === 0) {
    var headers = ["gameId", "name", "maxPlayers", "winnerIndex", "createdAt",
                   "gameFolderId", "metaFileId", "hostClientId", "gameStatus"];
    // Add player columns (player1 through player20)
    for (var p = 1; p <= 20; p++) {
      headers.push("player" + p);
    }
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  // Build row data with player columns initialized as empty
  var rowData = [
    record.gameId,
    record.name,
    record.maxPlayers,
    record.winnerIndex,
    record.createdAt,
    record.gameFolderId,
    record.metaFileId,
    "",  // hostClientId (empty initially) - Column 8 (index 7)
    ""   // gameStatus (empty initially) - Column 9 (index 8)
  ];
  
  // Add 20 empty player columns
  for (var p = 1; p <= 20; p++) {
    rowData.push("");
  }
  
  // Append the game record as a new row
  sheet.appendRow(rowData);
}


/**
 * jsonResponse(data)
 * Wraps any object as a JSON ContentService TextOutput.
 *
 * @param {Object} data
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}