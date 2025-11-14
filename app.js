let player;
let statements = [];
let activeIndex = -1;   // index of the last unlocked statement

function extractYouTubeID(url) {
  const reg = /(?:v=|youtu\.be\/|embed\/)([^&?/]+)/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

function onYouTubeIframeAPIReady() {}

async function loadVideo() {
  const url = document.getElementById("ytInput").value;
  const id = extractYouTubeID(url);

  if (!id) {
    alert("Invalid YouTube URL");
    return;
  }

  // Create YouTube player
  player = new YT.Player("videoContainer", {
    height: "100%",
    width: "100%",
    videoId: id,
    playerVars: { controls: 1 },
    events: {
      onReady: startPolling
    }
  });

  // Load statements file
  const jsonFile = `statements.${id}.json`;

  try {
    const res = await fetch(jsonFile);
    statements = await res.json();

    // Ensure sorted by timecode
    statements.sort((a, b) => a.timecode - b.timecode);

    activeIndex = -1;
    clearStatementPane();

  } catch (err) {
    statements = [];
    clearStatementPane();
  }
}

/* ---- Helper to clear pane ---- */

function clearStatementPane() {
  document.getElementById("statement").textContent = "";
}

/* ---- Poll video time ---- */

function startPolling() {
  setInterval(checkForStatementActivation, 500);
}

function checkForStatementActivation() {
  if (!player || statements.length === 0) return;

  const t = player.getCurrentTime();
  let newest = -1;

  // Find the most recent statement whose timecode has passed
  for (let i = 0; i < statements.length; i++) {
    if (t >= statements[i].timecode) newest = i;
    else break; // since sorted, no need to continue
  }

  if (newest !== activeIndex) {
    activeIndex = newest;
    showActiveStatement();
  }
}

function showActiveStatement() {
  if (activeIndex < 0) {
    clearStatementPane();
    return;
  }

  const s = statements[activeIndex];
  document.getElementById("statement").textContent = s.text.slice(0, 260);
}

/* ---- Voting ---- */

function sendVote(voteValue) {
  if (activeIndex < 0) {
    alert("No active statement yet.");
    return;
  }

  const current = statements[activeIndex];
  const t = Math.floor(player.getCurrentTime());

  const voteObj = {
    vote: voteValue,
    statementId: current.statementId,
    loadedTimecode: current.timecode,
    videoTimecode: t
  };

  console.log("VOTE:", voteObj);

  // Advance to next statement ONLY if its time has passed
  const nextIndex = activeIndex + 1;

  if (
    nextIndex < statements.length &&
    player.getCurrentTime() >= statements[nextIndex].timecode
  ) {
    activeIndex = nextIndex;
    showActiveStatement();
  } else {
    clearStatementPane();
  }
}
