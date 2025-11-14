let player;
let statements = [];
let activeIndex = -1;      // last fully visible / voted statement
let unlockedIndex = -1;    // highest index whose timecode has passed

function extractYouTubeID(url) {
  const reg = /(?:v=|youtu\.be\/|embed\/)([^&?/]+)/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

// Load a video by ID or from input
async function loadVideo(id = null) {
  if (!id) {
    const url = document.getElementById("ytInput").value;
    id = extractYouTubeID(url);
  }
  if (!id) return alert("Invalid YouTube URL");

  // Update URL hash
  window.location.hash = id;

  // Destroy old player if exists
  if (player && player.destroy) player.destroy();

  // Create YouTube player
  player = new YT.Player("videoContainer", {
    height: "100%",
    width: "100%",
    videoId: id,
    playerVars: { controls: 1, rel: 0, modestbranding: 1 },
    events: {
      onReady: () => {
        startPolling();    // keep statements unlocking
        startTimeline();   // smooth timeline update
      }
    }
  });

  // Clear statements pane
  document.getElementById("statementsPane").innerHTML = "";

  // Load statements JSON
  const jsonFile = `statements.${id}.json`;
  try {
    const res = await fetch(jsonFile);
    statements = await res.json();
    statements.sort((a, b) => Number(a.timecode) - Number(b.timecode));
  } catch (err) {
    statements = [];
  }

  activeIndex = -1;
  unlockedIndex = -1;
  renderStatements();
}

/* --- Poll video time --- */
function startPolling() {
  setInterval(() => {
    checkForUnlocks();
    drawTimeline(); // update timeline
  }, 100); // update more smoothly
}

function checkForUnlocks() {
  if (!player || statements.length === 0) return;

  const t = player.getCurrentTime();
  let newest = -1;

  for (let i = 0; i < statements.length; i++) {
    if (t >= Number(statements[i].timecode)) newest = i;
    else break;
  }

  if (newest !== unlockedIndex) {
    unlockedIndex = newest;

    // First unlocked statement becomes active
    if (activeIndex < 0 && unlockedIndex >= 0) activeIndex = 0;

    renderStatements();
  }
}

/* --- Redaction helper --- */
function redactText(str) {
  // Split by word boundaries
  return str.split(/(\s+)/).map(token => {
    // Preserve whitespace
    if (/^\s+$/.test(token)) return token;

    // Remove punctuation
    const lettersOnly = token.replace(/[^\w]/g, "");

    if (!lettersOnly) return token; // keep token if no letters

    // Number of blocks: divide letters by 2, round up
    const numBlocks = Math.ceil(lettersOnly.length / 2);

    return "█".repeat(numBlocks);
  }).join("");
}

/* --- Render timeline --- */
function drawTimeline() {
  const canvas = document.getElementById("timelineCanvas");
  if (!canvas || !player) return;
  const ctx = canvas.getContext("2d");

  // Use clientWidth/Height for drawing
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // Set canvas internal resolution to match CSS size
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const centerX = width / 2;
  const now = player.getCurrentTime();
  const range = 5; // seconds before/after

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Center line
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();

  // 1-second ticks
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  for (let sec = -range; sec <= range; sec++) {
    const x = centerX + (sec / range) * (width / 2);
    ctx.beginPath();
    ctx.moveTo(x, height * 0.6);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Statement dots
  ctx.fillStyle = "red";
  statements.forEach(s => {
    const offset = s.timecode - now;
    if (offset >= -range && offset <= range) {
      const x = centerX + (offset / range) * (width / 2);
      ctx.beginPath();
      ctx.arc(x, height * 0.3, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  requestAnimationFrame(drawTimeline);
}

// Start smooth timeline after player is ready
function startTimeline() {
  requestAnimationFrame(drawTimeline);
}

/* --- Render statements --- */
function renderStatements() {
  const pane = document.getElementById("statementsPane");
  const existing = Array.from(pane.children);
  const newContent = [];

  if (unlockedIndex < 0) return;

  for (let i = 0; i <= unlockedIndex; i++) {
    const s = statements[i];

    let div = existing.find(d => d.dataset.id == s.statementId);
    if (!div) {
      div = document.createElement("div");
      div.dataset.id = s.statementId;
      div.classList.add("statement");
      pane.appendChild(div);
    }

    const prefix = `#${s.statementId} `;

    if (i < activeIndex) {
      div.className = "statement voted";
    } else if (i === activeIndex) {
      div.className = "statement active";
      div.textContent = prefix + s.text.slice(0, 260);
    } else {
      div.className = "statement redacted";
      div.textContent = prefix + redactText(s.text.slice(0, 260));
    }

    newContent.push(div);
  }

  existing.forEach(div => {
    if (!newContent.includes(div)) div.remove();
  });
}

/* --- Voting --- */
function sendVote(voteValue) {
  if (activeIndex < 0) {
    if (unlockedIndex >= 0) {
      activeIndex = 0;
      renderStatements();
      return;
    } else {
      alert("No active statement yet.");
      return;
    }
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

  // Fade out voted statement
  const div = document.querySelector(`#statementsPane .statement[data-id='${current.statementId}']`);
  if (div) div.classList.add("voted");

  div.addEventListener("transitionend", () => {
    activeIndex++;
    renderStatements();
  }, { once: true });
}

/* --- YouTube API ready callback --- */
function onYouTubeIframeAPIReady() {
  const hashId = window.location.hash.slice(1);
  if (hashId) {
    document.getElementById("ytInput").value = `https://www.youtube.com/watch?v=${hashId}`;
    loadVideo(hashId);
  }
}

// Optional: allow manual load via button
document.getElementById("loadBtn")?.addEventListener("click", () => loadVideo());
