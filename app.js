let player;
let statementIndex = 0;
let statements = [];

// Load first statement if available
function showStatement() {
  if (statements.length === 0) {
    document.getElementById("statement").textContent = "Load statements to begin.";
    return;
  }

  const s = statements[statementIndex % statements.length];
  document.getElementById("statement").textContent = s.slice(0, 260);
}

// Extract YouTube ID from URL
function extractYouTubeID(url) {
  const reg = /(?:v=|youtu\.be\/|embed\/)([^&?/]+)/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

function onYouTubeIframeAPIReady() { /* created on loadVideo */ }

function loadVideo() {
  const url = document.getElementById("ytInput").value;
  const id = extractYouTubeID(url);

  if (!id) {
    alert("Invalid YouTube URL");
    return;
  }

  player = new YT.Player("videoContainer", {
    height: "100%",
    width: "100%",
    videoId: id,
    playerVars: { controls: 1 }
  });
}

// ----------------------------
// LOAD STATEMENTS FROM FILE
// ----------------------------
function loadStatementsFromFile() {
  const file = document.getElementById("fileInput").files[0];
  if (!file) return alert("Choose a file first.");

  const reader = new FileReader();

  reader.onload = () => {
    const text = reader.result;

    try {
      if (file.name.endsWith(".json")) {
        // Option B: JSON file
        statements = JSON.parse(text);
      } else {
        // Option A: Plain text (one statement per line)
        statements = text
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
      }
    } catch (err) {
      alert("Invalid file format.");
      return;
    }

    statementIndex = 0;
    showStatement();
    console.log(`Loaded ${statements.length} statements.`);
  };

  reader.readAsText(file);
}

// ----------------------------
// VOTING
// ----------------------------
function sendVote(voteValue) {
  if (!player) {
    alert("Load a video first");
    return;
  }
  if (statements.length === 0) {
    alert("Load statements first");
    return;
  }

  const timecode = Math.floor(player.getCurrentTime());
  const statementId = statementIndex;

  const voteObj = {
    vote: voteValue,
    statementId: statementId,
    timecode: timecode
  };

  console.log("VOTE:", voteObj);

  // Next statement
  statementIndex++;
  showStatement();
}
