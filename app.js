let player;
let statements = [];
let activeIndex = -1;      // last fully visible / voted statement
let unlockedIndex = -1;    // highest index whose timecode has passed
let transcript = "";       // full transcript text
let transcriptLines = [];  // parsed transcript lines with timestamps
let voteEvents = [];       // synthetic vote events
let processedVoteEvents = new Set(); // track which vote events have been processed
let statementVoteCounts = {}; // track vote counts per statement for coloring
let recentVoteFlashes = new Map(); // track recent vote flashes for visual effects
const NUM_PARTICIPANTS = 25; // Number of synthetic participants
const VOTE_DELAY_MIN = 1.0; // Minimum seconds after statement appears before votes start
const VOTE_DELAY_MAX = 8.0; // Maximum seconds after statement appears for votes to arrive
const VOTE_DELAY_MEAN = 3.0; // Mean time for votes to arrive (seconds)
const VOTE_DELAY_STDDEV = 2.0; // Standard deviation for vote timing (seconds)

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
  const jsonFile = `data/statements.${id}.json`;
  try {
    const res = await fetch(jsonFile);
    statements = await res.json();
    statements.sort((a, b) => Number(a.timecode) - Number(b.timecode));
  } catch (err) {
    statements = [];
  }

  // Load transcript file
  await loadTranscript(id);

  activeIndex = -1;
  unlockedIndex = -1;
  
  // Generate synthetic vote events for this video
  generateSyntheticVotes();
  
  renderStatements();
}

/* --- Synthetic Vote Generation --- */
// Random bias for a statement: lean (-1..1) and pass probability 0.05–0.15
function randomBias() {
  const lean = (Math.random() * 2) - 1;   // -1 = strongly disagree, +1 = strongly agree
  const pPass = 0.05 + Math.random() * 0.10;
  const pAgree = (1 - pPass) * (1 + lean) / 2;
  const pDisagree = (1 - pPass) * (1 - lean) / 2;
  return { pAgree, pDisagree, pPass };
}

// Returns +1 (agree) / -1 (disagree) / 0 (pass)
function sampleVote(p) {
  const r = Math.random();
  if (r < p.pAgree) return 1;
  else if (r < p.pAgree + p.pDisagree) return -1;
  else return 0;
}

// Generate a normally distributed random number using Box-Muller transform
function normalRandom(mean, stddev) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stddev + mean;
}

// Generate vote delay with normal distribution, clamped to min/max bounds
function generateVoteDelay() {
  let delay = normalRandom(VOTE_DELAY_MEAN, VOTE_DELAY_STDDEV);
  // Clamp to bounds
  delay = Math.max(VOTE_DELAY_MIN, Math.min(VOTE_DELAY_MAX, delay));
  return delay;
}

// Generate vote events
function generateSyntheticVotes() {
  if (statements.length === 0) return;
  
  voteEvents = [];
  processedVoteEvents.clear();
  statementVoteCounts = {};
  recentVoteFlashes.clear();

  // Initialize vote counts for each statement
  statements.forEach(s => {
    statementVoteCounts[s.statementId] = { agree: 0, disagree: 0, pass: 0 };
  });

  // Precompute a bias for each statement
  const biases = {};
  for (const s of statements) {
    biases[s.statementId] = randomBias();
  }

  for (let participantId = 0; participantId < NUM_PARTICIPANTS; participantId++) {
    for (const s of statements) {
      const p = biases[s.statementId];
      const vote = sampleVote(p);

      // Use normally distributed delay with configurable parameters
      const delay = generateVoteDelay();
      const timecode = s.timecode + delay;

      voteEvents.push({
        participantId,
        statementId: s.statementId,
        vote,          // +1 / -1 / 0
        timecode       // always >= statement startTime
      });
    }
  }

  // Sort events by time order
  voteEvents.sort((a, b) => a.timecode - b.timecode);
  
  console.log(`Generated ${voteEvents.length} synthetic vote events for ${NUM_PARTICIPANTS} participants`);
}

/* --- Transcript functions --- */
async function loadTranscript(videoId) {
  const transcriptFile = `data/rooignore/transcript.${videoId}.txt`;
  try {
    const res = await fetch(transcriptFile);
    transcript = await res.text();
    parseTranscript();
    displayTranscript();
  } catch (err) {
    transcript = "";
    transcriptLines = [];
    const textarea = document.getElementById("transcriptTextarea");
    if (textarea) {
      textarea.value = "Transcript not available for this video.";
    }
  }
}

function parseTranscript() {
  transcriptLines = [];
  if (!transcript) return;

  const lines = transcript.split('\n');
  let currentTime = 0;
  let currentText = "";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check if line starts with timestamp (MM:SS format)
    const timestampMatch = trimmedLine.match(/^(\d{2}:\d{2})\s+(.*)$/);
    if (timestampMatch) {
      // Save previous entry if exists
      if (currentText) {
        transcriptLines.push({
          timestamp: currentTime,
          text: currentText.trim()
        });
      }
      
      // Parse new timestamp
      const [, timeStr, text] = timestampMatch;
      const [minutes, seconds] = timeStr.split(':').map(Number);
      currentTime = minutes * 60 + seconds;
      currentText = text;
    } else {
      // Continuation of previous text
      currentText += " " + trimmedLine;
    }
  }

  // Add final entry
  if (currentText) {
    transcriptLines.push({
      timestamp: currentTime,
      text: currentText.trim()
    });
  }
}

function displayTranscript() {
  const textarea = document.getElementById("transcriptTextarea");
  if (!textarea) return;

  if (!transcriptLines.length) {
    textarea.value = "Transcript not available for this video.";
    return;
  }

  // Initially show empty transcript - will be updated by updateTranscriptDisplay
  textarea.value = "Hit play to see transcript appear here.";
}

function updateTranscriptDisplay() {
  if (!player || !transcriptLines.length) return;

  const currentTime = player.getCurrentTime();
  const textarea = document.getElementById("transcriptTextarea");
  if (!textarea) return;

  // Find the current position in the transcript
  let displayText = "";
  let foundCurrentSegment = false;

  for (let i = 0; i < transcriptLines.length; i++) {
    const currentSegment = transcriptLines[i];
    const nextSegment = transcriptLines[i + 1];

    if (currentTime >= currentSegment.timestamp) {
      if (nextSegment && currentTime < nextSegment.timestamp) {
        // We're currently in this segment - show partial text with typing effect
        const segmentDuration = nextSegment.timestamp - currentSegment.timestamp;
        const timeIntoSegment = currentTime - currentSegment.timestamp;
        const progress = Math.min(timeIntoSegment / segmentDuration, 1);
        
        // Calculate how many characters to show based on progress
        const segmentText = currentSegment.text.trim().replace(/\s+/g, ' ');
        const totalChars = segmentText.length;
        const charsToShow = Math.floor(progress * totalChars);
        
        // Add all previous complete segments with space separator
        if (displayText) displayText += " ";
        displayText += segmentText.substring(0, charsToShow);
        
        foundCurrentSegment = true;
        break;
      } else if (!nextSegment) {
        // This is the last segment and we're past its start time
        if (displayText) displayText += " ";
        displayText += currentSegment.text.trim().replace(/\s+/g, ' ');
        foundCurrentSegment = true;
        break;
      } else {
        // We're past this segment completely - show full text
        if (displayText) displayText += " ";
        displayText += currentSegment.text.trim().replace(/\s+/g, ' ');
      }
    } else {
      // We haven't reached this segment yet
      break;
    }
  }

  if (!foundCurrentSegment && displayText === "") {
    textarea.value = "Hit play to see transcript appear here.";
    return;
  }

  // Normalize whitespace in final display text
  displayText = displayText.replace(/\s+/g, ' ').trim();

  // Only update if content has changed to avoid cursor jumping
  if (textarea.value !== displayText) {
    const wasAtBottom = textarea.scrollTop >= (textarea.scrollHeight - textarea.clientHeight - 10);
    textarea.value = displayText;
    
    // Auto-scroll to bottom to show latest text
    if (wasAtBottom || textarea.scrollTop === 0) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }
}

/* --- Poll video time --- */
function startPolling() {
  setInterval(() => {
    checkForUnlocks();
    processVoteEvents(); // process synthetic votes
    drawTimeline(); // update timeline
    updateTranscriptDisplay(); // update visible transcript content
  }, 100); // update more smoothly
}

/* --- Vote Event Processing --- */
function processVoteEvents() {
  if (!player || voteEvents.length === 0) return;
  
  const currentTime = player.getCurrentTime();
  
  // Process all vote events that should have happened by now
  voteEvents.forEach((event, index) => {
    const eventKey = `${event.participantId}-${event.statementId}-${event.timecode}`;
    
    if (currentTime >= event.timecode && !processedVoteEvents.has(eventKey)) {
      // Process this vote event
      processedVoteEvents.add(eventKey);
      
      // Update vote counts
      if (statementVoteCounts[event.statementId]) {
        if (event.vote === 1) {
          statementVoteCounts[event.statementId].agree++;
        } else if (event.vote === -1) {
          statementVoteCounts[event.statementId].disagree++;
        } else {
          statementVoteCounts[event.statementId].pass++;
        }
      }
      
      // Add flash effect for this vote
      const flashKey = `${event.statementId}-${Date.now()}`;
      recentVoteFlashes.set(flashKey, {
        statementId: event.statementId,
        vote: event.vote,
        timestamp: Date.now(),
        intensity: 1.0
      });
      
      // Remove flash after 500ms
      setTimeout(() => {
        recentVoteFlashes.delete(flashKey);
      }, 500);
    }
  });
  
  // Update flash intensities (fade out over time)
  const now = Date.now();
  recentVoteFlashes.forEach((flash, key) => {
    const age = now - flash.timestamp;
    flash.intensity = Math.max(0, 1 - (age / 500)); // Fade over 500ms
    if (flash.intensity <= 0) {
      recentVoteFlashes.delete(key);
    }
  });
}

// Get the dominant vote color for a statement with flash effects
function getStatementColor(statementId, baseOpacity = 1.0) {
  // Check for recent vote flashes for this statement first - they take priority
  let strongestFlash = null;
  let maxFlashIntensity = 0;
  
  recentVoteFlashes.forEach(flash => {
    if (flash.statementId === statementId && flash.intensity > maxFlashIntensity) {
      maxFlashIntensity = flash.intensity;
      strongestFlash = flash;
    }
  });
  
  // If there's an active flash, show it prominently
  if (strongestFlash && maxFlashIntensity > 0) {
    let flashColor;
    if (strongestFlash.vote === 1) {
      flashColor = { r: 34, g: 197, b: 94 }; // Bright green for agree
    } else if (strongestFlash.vote === -1) {
      flashColor = { r: 248, g: 113, b: 113 }; // Bright red for disagree
    } else {
      flashColor = { r: 209, g: 213, b: 219 }; // Bright gray for pass
    }
    
    // Make flash very visible with high opacity
    const flashAlpha = 0.7 + (maxFlashIntensity * 0.3); // 0.7 to 1.0 alpha
    return `rgba(${flashColor.r}, ${flashColor.g}, ${flashColor.b}, ${flashAlpha * baseOpacity})`;
  }
  
  // No active flash, show base accumulated color if any votes have been cast
  const counts = statementVoteCounts[statementId];
  if (counts) {
    const total = counts.agree + counts.disagree + counts.pass;
    if (total > 0) {
      // Determine dominant vote type
      const maxCount = Math.max(counts.agree, counts.disagree, counts.pass);
      
      if (counts.agree === maxCount) {
        // Muted green for agree base
        const intensity = counts.agree / total;
        const alpha = (0.2 + (intensity * 0.3)) * baseOpacity; // 0.2 to 0.5 alpha
        return `rgba(72, 187, 120, ${alpha})`;
      } else if (counts.disagree === maxCount) {
        // Muted red for disagree base
        const intensity = counts.disagree / total;
        const alpha = (0.2 + (intensity * 0.3)) * baseOpacity; // 0.2 to 0.5 alpha
        return `rgba(239, 68, 68, ${alpha})`;
      } else {
        // Muted gray for pass base
        const intensity = counts.pass / total;
        const alpha = (0.2 + (intensity * 0.3)) * baseOpacity; // 0.2 to 0.5 alpha
        return `rgba(156, 163, 175, ${alpha})`;
      }
    }
  }
  
  return null; // No votes yet, use default gray
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
    const oldUnlockedIndex = unlockedIndex;
    unlockedIndex = newest;

    // First unlocked statement becomes active
    if (activeIndex < 0 && unlockedIndex >= 0) activeIndex = 0;

    // If we were waiting for a next statement and one just unlocked
    if (oldUnlockedIndex < activeIndex + 1 && unlockedIndex >= activeIndex + 1) {
      const waitingDiv = document.querySelector(`#statementsPane .statement.no-next`);
      if (waitingDiv) {
        // Transition from waiting state to face-out, then move to next
        waitingDiv.classList.remove("no-next");
        waitingDiv.classList.add("facing-out");

        setTimeout(() => {
          activeIndex++;
          renderStatements();
        }, 300);
      }
    }

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
        const voteColor = getStatementColor(s.statementId, opacity);
        color = voteColor || `rgba(180, 180, 180, ${opacity})`;
      } else if (offset > 0) {
        // Approaching within 500ms: transition from light/small to dark/large
        const progress = (transitionWindow - offset) / transitionWindow; // 0 to 1
        const easedProgress = easeInOutCubic(progress);

        size = 3 + (easedProgress * 4); // 3px to 7px
        opacity = 0.4 + (easedProgress * 0.5); // 0.4 to 0.9

        const voteColor = getStatementColor(s.statementId, opacity);
        if (voteColor) {
          color = voteColor;
        } else {
          // Color transitions from light grey to dark grey
          const greyValue = Math.floor(180 - (easedProgress * 130)); // 180 to 50
          color = `rgba(${greyValue}, ${greyValue}, ${greyValue}, ${opacity})`;
        }
      } else if (offset > -transitionWindow) {
        // Just passed within 500ms: transition from dark/large to medium/medium
        const progress = Math.abs(offset) / transitionWindow; // 0 to 1
        const easedProgress = easeInOutCubic(progress);

        size = 7 - (easedProgress * 2); // 7px to 5px
        opacity = 0.9 - (easedProgress * 0.3); // 0.9 to 0.6

        const voteColor = getStatementColor(s.statementId, opacity);
        if (voteColor) {
          color = voteColor;
        } else {
          // Color transitions from dark grey to medium grey
          const greyValue = Math.floor(50 + (easedProgress * 50)); // 50 to 100
          color = `rgba(${greyValue}, ${greyValue}, ${greyValue}, ${opacity})`;
        }
      } else {
        // Far past: medium grey, medium size (default passed state)
        size = 5;
        opacity = 0.6;
        const voteColor = getStatementColor(s.statementId, opacity);
        if (voteColor) {
          color = voteColor;
        } else {
          color = `rgba(100, 100, 100, ${opacity})`;
        }
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

  if (unlockedIndex < 0) {
    // Show message when video is loaded but no statements unlocked yet
    if (statements.length > 0) {
      pane.innerHTML = "Hit play to see statements appear here.";
    }
    return;
  }

  // Clear any text content when statements start appearing
  if (pane.innerHTML && !pane.querySelector('.statement')) {
    pane.innerHTML = "";
  }

  for (let i = 0; i <= unlockedIndex; i++) {
    const s = statements[i];

    let div = existing.find(d => d.dataset.id == s.statementId);
    if (!div) {
      div = document.createElement("div");
      div.dataset.id = s.statementId;
      div.classList.add("statement");
      pane.appendChild(div);
    }

    const prefix = `#${s.statementId}. `;

    // Don't change classes if the div is currently animating
    const isAnimating = div.classList.contains("voting-agree") ||
                       div.classList.contains("voting-disagree") ||
                       div.classList.contains("voting-pass") ||
                       div.classList.contains("fading-out") ||
                       div.classList.contains("facing-out") ||
                       div.classList.contains("no-next");

    if (!isAnimating) {
      if (i < activeIndex) {
        div.className = "statement voted";
      } else if (i === activeIndex) {
        div.className = "statement active";
        div.textContent = prefix + s.text.slice(0, 260);
      } else {
        div.className = "statement redacted";
        div.textContent = prefix + redactText(s.text.slice(0, 260));
      }
    } else if (i === activeIndex && div.classList.contains("active")) {
      // Update text content even during animation for active statement
      div.textContent = prefix + s.text.slice(0, 260);
    }

    newContent.push(div);
  }

  existing.forEach(div => {
    if (!newContent.includes(div)) div.remove();
  });
}

/* --- Voting --- */
function sendVote(voteValue) {
  let targetIndex = activeIndex;
  let div;

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

  // Check if there's a statement in "no-next" state (waiting for next statement)
  const waitingDiv = document.querySelector(`#statementsPane .statement.no-next`);
  if (waitingDiv) {
    // Re-vote on the waiting statement
    div = waitingDiv;
    targetIndex = activeIndex; // Keep the same activeIndex
  } else {
    // Normal voting on active statement
    div = document.querySelector(`#statementsPane .statement[data-id='${statements[activeIndex].statementId}']`);
    if (!div) return;
  }

  const current = statements[targetIndex];
  const t = Math.floor(player.getCurrentTime());

  const voteObj = {
    vote: voteValue,
    statementId: current.statementId,
    loadedTimecode: current.timecode,
    videoTimecode: t
  };
  console.log("VOTE:", voteObj);

  // Check if there's a next statement available and unlocked
  const hasNextStatement = activeIndex + 1 < statements.length && activeIndex + 1 <= unlockedIndex;

  // Determine vote color class
  let voteClass;
  if (voteValue === 1) voteClass = "voting-agree";
  else if (voteValue === -1) voteClass = "voting-disagree";
  else voteClass = "voting-pass";

  // Clear all previous voting classes
  div.classList.remove("voting-agree", "voting-disagree", "voting-pass", "no-next");

  // Step 1: Flash appropriate color
  div.classList.add(voteClass);

  setTimeout(() => {
    // Keep the color but proceed with next steps
    if (hasNextStatement) {
      // Step 2a: Fade out then face out before next card moves in
      div.classList.add("fading-out");

      setTimeout(() => {
        div.classList.remove("fading-out");
        div.classList.add("facing-out");

        setTimeout(() => {
          // Move to next statement
          activeIndex++;
          renderStatements();
        }, 300); // Wait for face-out animation
      }, 400); // Wait for fade-out animation
    } else {
      // Step 2b: No next card available - blur, shrink, and dim but stay with color
      div.classList.add("no-next");
      // Don't increment activeIndex - stay on this statement
    }
  }, 300); // Wait for color flash
}

/* --- Modal functions --- */
function showModal() {
  const modal = document.getElementById("urlModal");
  modal.classList.add("show");
  document.getElementById("ytInput").focus();
}

function hideModal() {
  const modal = document.getElementById("urlModal");
  modal.classList.remove("show");
}

/* --- YouTube API ready callback --- */
function onYouTubeIframeAPIReady() {
  const hashId = window.location.hash.slice(1);
  if (hashId) {
    document.getElementById("ytInput").value = `https://www.youtube.com/watch?v=${hashId}`;
    loadVideo(hashId);
  } else {
    // Show modal if no URL in hash
    showModal();
  }
}

// Modal form submission
document.getElementById("urlForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = document.getElementById("ytInput").value.trim();
  if (url) {
    hideModal();
    const id = extractYouTubeID(url);
    if (id) {
      loadVideo(id);
    } else {
      alert("Invalid YouTube URL");
      showModal();
    }
  }
});

// Cancel modal
document.getElementById("cancelModal").addEventListener("click", () => {
  hideModal();
});

// Configure button to reopen modal
document.getElementById("configureBtn").addEventListener("click", () => {
  showModal();
});

// Close modal when clicking outside
document.getElementById("urlModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    hideModal();
  }
});

// Keyboard shortcuts for voting
document.addEventListener("keydown", (event) => {
  // Only handle shortcuts if we're not typing in an input field
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return;
  }

  // Prevent default behavior for our handled keys
  const handledKeys = ['a', 'd', 'p', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
  if (handledKeys.includes(event.key)) {
    event.preventDefault();
  }

  switch (event.key) {
    case 'a':
    case 'ArrowRight':
      sendVote(1); // Agree
      break;
    case 'd':
    case 'ArrowLeft':
      sendVote(-1); // Disagree
      break;
    case 'p':
    case 'ArrowDown':
      sendVote(0); // Pass
      break;
  }
});

/* --- Add new statement functionality --- */
function addNewStatement() {
  const input = document.getElementById("newStatementInput");
  const text = input.value.trim();

  if (!text) {
    alert("Please enter a statement");
    return;
  }

  if (!player) {
    alert("Please load a video first");
    return;
  }

  const currentTime = player.getCurrentTime();
  const newStatementId = Math.max(...statements.map(s => s.statementId), 0) + 1;

  const newStatement = {
    statementId: newStatementId,
    timecode: Math.floor(currentTime * 10) / 10, // Round to 1 decimal place
    text: text
  };

  // Add to statements array and sort by timecode
  statements.push(newStatement);
  statements.sort((a, b) => Number(a.timecode) - Number(b.timecode));

  // Clear input
  input.value = "";

  // Re-render statements to show the new one
  renderStatements();

  console.log("Added new statement:", newStatement);
}

/* --- Export functionality --- */
function exportStatements() {
  const textarea = document.getElementById("exportTextarea");

  if (statements.length === 0) {
    textarea.value = "No statements to export";
    return;
  }

  // Create JSON export
  const exportData = JSON.stringify(statements, null, 2);
  textarea.value = exportData;

  // Select all text for easy copying
  textarea.select();
  textarea.setSelectionRange(0, 99999); // For mobile devices

  console.log("Exported statements:", statements);
}

/* --- Collapsible section functionality --- */
function toggleSection(toggleElement, contentElement) {
  const isExpanded = contentElement.classList.contains('expanded');

  if (isExpanded) {
    contentElement.classList.remove('expanded');
    toggleElement.classList.remove('expanded');
  } else {
    contentElement.classList.add('expanded');
    toggleElement.classList.add('expanded');
  }
}

// Event listeners for new functionality
document.addEventListener("DOMContentLoaded", () => {
  // Manage statements toggle
  document.getElementById("manageStatementsToggle").addEventListener("click", () => {
    const toggle = document.getElementById("manageStatementsToggle");
    const content = document.getElementById("manageStatementsContent");
    toggleSection(toggle, content);
  });

  // Add statement button
  document.getElementById("addStatementBtn").addEventListener("click", addNewStatement);

  // Export button
  document.getElementById("exportBtn").addEventListener("click", exportStatements);

  // Enter key in statement input
  document.getElementById("newStatementInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addNewStatement();
    }
  });
});
