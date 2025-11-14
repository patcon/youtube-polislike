let player;
let statements = [];
let activeIndex = -1; // last fully visible / voted statement
let unlockedIndex = -1; // highest index whose timecode has passed

function extractYouTubeID(url) {
  const reg = /(?:v=|youtu\.be\/|embed\/)([^&?/]+)/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

async function loadVideo() {
  const url = document.getElementById("ytInput").value;
  const id = extractYouTubeID(url);

  if (!id) return alert("Invalid YouTube URL");

  // Create YouTube player
  player = new YT.Player("videoContainer", {
    height: "100%",
    width: "100%",
    videoId: id,
    playerVars: { controls: 1 },
    events: { onReady: startPolling }
  });
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
  setInterval(checkForUnlocks, 500);
}

function checkForUnlocks() {
  if (!player || statements.length === 0) return;

  const t = player.getCurrentTime();
  let newest = -1;

  // Find the newest statement whose timecode has passed
  for (let i = 0; i < statements.length; i++) {
    if (t >= Number(statements[i].timecode)) newest = i;
    else break;
  }

  if (newest !== unlockedIndex) {
    unlockedIndex = newest;

    // If first statement unlocked, make it active
    if (activeIndex < 0 && unlockedIndex >= 0) activeIndex = 0;

    renderStatements();
  }
}

/* --- Redaction helper --- */
function redactText(str) {
  // Replace every 2 consecutive non-whitespace chars with one █
  const pairs = str.match(/(?:\S{2})|\S/g) || [];
  return pairs.map(chunk => chunk.trim() ? "█" : chunk).join(" ");
}

/* --- Render statements --- */
function renderStatements() {
  const pane = document.getElementById("statementsPane");

  // Track existing elements to apply fade-out
  const existing = Array.from(pane.children);
  const newContent = [];

  if (unlockedIndex < 0) return;

  for (let i = 0; i <= unlockedIndex; i++) {
    const s = statements[i];

    // Reuse existing div if it exists
    let div = existing.find(d => d.dataset.id == s.statementId);
    if (!div) {
      div = document.createElement("div");
      div.dataset.id = s.statementId;
      div.classList.add("statement");
      pane.appendChild(div);
    }

    const prefix = `#${s.statementId} `;

    if (i < activeIndex) {
      // Already voted, keep as voted class (fade handled in vote)
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

  // Remove any old statements not in newContent after fade
  existing.forEach(div => {
    if (!newContent.includes(div)) {
      div.remove();
    }
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

  // Apply voted class to trigger fade/slide
  const div = document.querySelector(`#statementsPane .statement[data-id='${current.statementId}']`);
  if (div) div.classList.add("voted");

  // After transition ends, move activeIndex forward and re-render
  div.addEventListener("transitionend", () => {
    activeIndex++;
    renderStatements();
  }, { once: true });
}
