let player;
let statementIndex = 0;
let statements = [];

function showStatement() {
  if (statements.length === 0) {
    document.getElementById("statement").textContent = "No statements loaded.";
    return;
  }

  const current = statements[statementIndex % statements.length];
  document.getElementById("statement").textContent = current.text.slice(0, 260);
}

function extractYouTubeID(url) {
  const reg = /(?:v=|youtu\.be\/|embed\/)([^&?/]+)/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

function onYouTubeIframeAPIReady() {
  // Player created in loadVideo()
}

async function loadVideo() {
  const url = document.getElementById("ytInput").value;
  const id = extractYouTubeID(url);

  if (!id) {
    alert("Invalid YouTube URL");
    return;
  }

  // Load YouTube player
  player = new YT.Player("videoContainer", {
    height: "100%",
    width: "100%",
    videoId: id,
    playerVars: { controls: 1 }
  });

  // Load JSON statements
  const jsonFile = `statements.${id}.json`;

  try {
    const res = await fetch(jsonFile);
    if (!res.ok) throw new Error();
    statements = await res.json();
    statementIndex = 0;
    showStatement();
    console.log(`Loaded ${statements.length} statements from ${jsonFile}`);
  } catch (e) {
    statements = [];
    document.getElementById("statement").textContent =
      `Could not load ${jsonFile}`;
  }
}

function sendVote(voteValue) {
  if (!player) {
    alert("Load a video first");
    return;
  }
  if (statements.length === 0) {
    alert("No statements loaded");
    return;
  }

  const currentTime = Math.floor(player.getCurrentTime());
  const currentStatement = statements[statementIndex];

  const voteObj = {
    vote: voteValue,
    statementId: currentStatement.statementId,
    loadedTimecode: currentStatement.timecode,
    videoTimecode: currentTime
  };

  console.log("VOTE:", voteObj);

  statementIndex++;
  showStatement();
}
