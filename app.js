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

  // Center line (current time marker - stays fixed)
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();

  // 1-second ticks (move with time)
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  
  // Calculate the fractional part of current time for smooth movement
  const timeFraction = now % 1;
  
  // Draw ticks for a wider range to ensure smooth scrolling
  for (let sec = -range - 1; sec <= range + 1; sec++) {
    // Offset each tick by the fractional time to create smooth movement
    const tickTime = sec - timeFraction;
    const x = centerX + (tickTime / range) * (width / 2);
    
    // Only draw if within visible range
    if (x >= 0 && x <= width) {
      ctx.beginPath();
      ctx.moveTo(x, height * 0.6);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  // Statement dots (move with time, staying at their fixed positions)
  statements.forEach(s => {
    const offset = s.timecode - now;
    if (offset >= -range && offset <= range) {
      const x = centerX + (offset / range) * (width / 2);
      
      // 500ms transition window (0.5 seconds)
      const transitionWindow = 0.5;
      
      // Smooth easing function (ease-in-out cubic)
      const easeInOutCubic = (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };
      
      // Calculate visual properties based on position relative to center
      let size, opacity, color;
      
      if (offset > transitionWindow) {
        // Far future: light grey, small (default approaching state)
        size = 3;
        opacity = 0.4;
        color = `rgba(180, 180, 180, ${opacity})`;
      } else if (offset > 0) {
        // Approaching within 500ms: transition from light/small to dark/large
        const progress = (transitionWindow - offset) / transitionWindow; // 0 to 1
        const easedProgress = easeInOutCubic(progress);
        
        size = 3 + (easedProgress * 4); // 3px to 7px
        opacity = 0.4 + (easedProgress * 0.5); // 0.4 to 0.9
        
        // Color transitions from light grey to dark grey
        const greyValue = Math.floor(180 - (easedProgress * 130)); // 180 to 50
        color = `rgba(${greyValue}, ${greyValue}, ${greyValue}, ${opacity})`;
      } else if (offset > -transitionWindow) {
        // Just passed within 500ms: transition from dark/large to medium/medium
        const progress = Math.abs(offset) / transitionWindow; // 0 to 1
        const easedProgress = easeInOutCubic(progress);
        
        size = 7 - (easedProgress * 2); // 7px to 5px
        opacity = 0.9 - (easedProgress * 0.3); // 0.9 to 0.6
        
        // Color transitions from dark grey to medium grey
        const greyValue = Math.floor(50 + (easedProgress * 50)); // 50 to 100
        color = `rgba(${greyValue}, ${greyValue}, ${greyValue}, ${opacity})`;
      } else {
        // Far past: medium grey, medium size (default passed state)
        size = 5;
        opacity = 0.6;
        color = `rgba(100, 100, 100, ${opacity})`;
      }
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, height * 0.3, size, 0, Math.PI * 2);
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
