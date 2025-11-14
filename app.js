let player;
let statementIndex = 0;

// Example 260-char max statements. Replace with your real data.
const statements = [
  "Statement 1: This is an example statement for voting.",
  "Statement 2: Another example question or claim goes here.",
  "Statement 3: A longer one just to test the 260 character limit. ".repeat(5).slice(0, 260),
];

// Load first statement
document.addEventListener("DOMContentLoaded", () => {
  showStatement();
});

// Extract a YouTube ID from URL
function extractYouTubeID(url) {
  const reg = /(?:v=|youtu\.be\/|embed\/)([^&?/]+)/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

// Called when the YouTube API script is ready
function onYouTubeIframeAPIReady() {
  // Player created only after user loads a video
}

function loadVideo() {
  const url = document.getElementById("ytInput").value;
  const id = extractYouTubeID(url);

  if (!id) {
    alert("Invalid YouTube URL");
    return;
  }

  // Create/recreate player
  player = new YT.Player("videoContainer", {
    height: "100%",
    width: "100%",
    videoId: id,
    playerVars: { controls: 1 }
  });
}

function showStatement() {
  const s = statements[statementIndex % statements.length];
  document.getElementById("statement").textContent = s;
}

function sendVote(voteValue) {
  if (!player) {
    alert("Load a video first");
    return;
  }

  const timecode = Math.floor(player.getCurrentTime());
  const statementId = statementIndex;

  const voteObj = {
    vote: voteValue,          // +1 / -1 / 0
    statementId: statementId, // sequential ID
    timecode: timecode        // seconds
  };

  console.log("VOTE:", voteObj);

  // Next statement
  statementIndex++;
  showStatement();
}
