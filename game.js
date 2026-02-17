/* Gothic Chronicle — deterministic engine + GPT overlay (safe).
   - Deterministic world: rooms/items/flags are truth
   - GPT Overlay: can only "paint" scene + choice text for legal intent IDs
   - Save: localStorage
*/

const SAVE_KEY = "gothicChronicle.save.v1";
const OVERLAY_KEY = "gothicChronicle.overlay.v1";

/* ---------------------------
   WORLD DATA (deterministic)
---------------------------- */
const WORLD = {
  rooms: {
    gate: {
      name: "Iron Gate",
      descSeed: "A rusted iron gate stands between you and the estate. Fog coils like breath in winter.",
      exits: {
        north: { to: "courtyard", requiresFlag: "gate_unlocked" },
        east: { to: "wallpath" }
      },
      items: ["old_note"],
      tags: ["outdoors", "fog", "threshold"],
      firstVisitMilestone: "m_gate_first"
    },

    wallpath: {
      name: "Outer Wall Path",
      descSeed: "You follow stonework slick with damp. The wall rises like a mute witness.",
      exits: { west: { to: "gate" }, north: { to: "servicedoor" } },
      items: [],
      tags: ["outdoors", "stone", "quiet"]
    },

    servicedoor: {
      name: "Service Door",
      descSeed: "A narrow door with a stubborn lock. Scratches mark the wood as if something begged to be let in—or out.",
      exits: {
        south: { to: "wallpath" },
        north: { to: "kitchen", requiresFlag: "service_unlocked" }
      },
      items: [],
      tags: ["wood", "lock"],
      lock: { flagToSet: "service_unlocked", keyItem: "brass_key" }
    },

    kitchen: {
      name: "Kitchen",
      descSeed: "Cold hearth. Hanging hooks. The smell of iron and old herbs. Someone has been here recently—barely.",
      exits: { south: { to: "servicedoor" } },
      items: ["matchbook"],
      tags: ["indoors", "hearth", "stale"]
    },

    courtyard: {
      name: "Courtyard",
      descSeed: "Moonlight spills into a courtyard of broken statues. A fountain lies cracked, the water black and still.",
      exits: { south: { to: "gate" }, north: { to: "foyer" } },
      items: ["brass_key"],
      tags: ["outdoors", "moonlight", "statues"],
      firstVisitMilestone: "m_courtyard_first"
    },

    foyer: {
      name: "Foyer",
      descSeed: "A grand foyer stripped of warmth. Portraits stare with eyes too certain. The staircase ascends into shadow.",
      exits: {
        south: { to: "courtyard" },
        east: { to: "library", requiresFlag: "candle_lit" }
      },
      items: ["candle"],
      tags: ["indoors", "portraits", "echo"],
      firstVisitMilestone: "m_foyer_first"
    },

    library: {
      name: "Library",
      descSeed: "Books like tombstones. Dust thick as velvet. In the corner, a lectern waits like an accusation.",
      exits: { west: { to: "foyer" } },
      items: ["silver_seal"],
      tags: ["indoors", "books", "secrets"],
      firstVisitMilestone: "m_library_first"
    }
  },

  items: {
    old_note: {
      name: "Old Note",
      examine: "The ink has bled, but one line remains: “Do not enter unlit. The house favors the unseen.”"
    },
    brass_key: {
      name: "Brass Key",
      examine: "A brass key, warm despite the air. The teeth are worn as if often turned in fear."
    },
    matchbook: {
      name: "Matchbook",
      examine: "A cheap matchbook. The cover bears a faded crest—three ravens and a crown."
    },
    candle: {
      name: "Candle",
      examine: "A pale candle. Unlit. The wick looks strangely new."
    },
    silver_seal: {
      name: "Silver Seal",
      examine: "A cold silver seal engraved with a crescent and thorned rose. It feels like a boundary."
    }
  }
};

/* ---------------------------
   STATE / SAVE
---------------------------- */
function defaultState() {
  return {
    roomId: "gate",
    inventory: [],
    flags: {},
    visited: {},
    milestones: {},
    turn: 0,
    chronicle: []
  };
}

let STATE = loadState();
let OVERLAY = loadOverlay(); // {sceneText?:string, choices?:[{id,text}], ts?:number}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.roomId) return defaultState();
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(STATE));
}

/* ---------------------------
   OVERLAY STORAGE
---------------------------- */
function loadOverlay() {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOverlay() {
  if (!OVERLAY) return;
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(OVERLAY));
}

function clearOverlay() {
  OVERLAY = null;
  localStorage.removeItem(OVERLAY_KEY);
}

/* ---------------------------
   HELPERS
---------------------------- */
function room() {
  return WORLD.rooms[STATE.roomId];
}
function hasItem(itemId) {
  return STATE.inventory.includes(itemId);
}
function hasFlag(flag) {
  return !!STATE.flags[flag];
}
function setFlag(flag, val = true) {
  STATE.flags[flag] = !!val;
}
function addChron(entry) {
  STATE.chronicle.push(entry);
  if (STATE.chronicle.length > 400) STATE.chronicle.shift();
}

/* ---------------------------
   UI DRAWER (optional panel)
   Requires elements from your index.html:
   - #drawer, #drawerTitle, #drawerBody
---------------------------- */
function showDrawer(title, body) {
  const drawer = document.getElementById("drawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerBody = document.getElementById("drawerBody");
  if (!drawer || !drawerTitle || !drawerBody) return;

  drawer.style.display = "block";
  drawer.open = true;
  drawerTitle.textContent = title;
  drawerBody.textContent = body;
}

function hideDrawer() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;
  drawer.open = false;
}

/* ---------------------------
   INTENTS (legal move set)
   IDs match your console output style:
   MOVE_south, INVENTORY, WAIT, etc.
---------------------------- */
function getLegalIntents() {
  const r = room();
  const intents = [];

  // Movement
  for (const [dir, ex] of Object.entries(r.exits || {})) {
    if (ex.requiresFlag && !hasFlag(ex.requiresFlag)) continue;
    intents.push({ id: `MOVE_${dir}`, type: "move", dir, to: ex.to });
  }

  // Take visible items
  for (const it of (r.items || [])) {
    intents.push({ id: `TAKE_${it}`, type: "take", itemId: it });
  }

  // Special: unlock service door (if present)
  if (STATE.roomId === "servicedoor") {
    const lock = r.lock;
    if (lock && !hasFlag(lock.flagToSet)) {
      if (hasItem(lock.keyItem)) intents.push({ id: "UNLOCK_service", type: "unlock", flag: lock.flagToSet });
      else intents.push({ id: "RATTLE_lock", type: "misc", action: "rattle_lock" });
    }
  }

  // Special: light candle if have matchbook + candle (in room or inventory) and not lit
  const hasCandleVisibleOrHeld = (r.items || []).includes("candle") || hasItem("candle");
  if (hasItem("matchbook") && hasCandleVisibleOrHeld && !hasFlag("candle_lit")) {
    intents.push({ id: "LIGHT_candle", type: "use", action: "light_candle" });
  }

  // Utility
  intents.push({ id: "INVENTORY", type: "inventory" });
  intents.push({ id: "WAIT", type: "wait" });

  return intents;
}

/* ---------------------------
   NARRATION (baseline)
---------------------------- */
function narrateScene() {
  const r = room();
  const visitedCount = STATE.visited[STATE.roomId] || 0;
  let text = r.descSeed;

  if (STATE.roomId === "foyer" && !hasFlag("candle_lit")) {
    text += " The darker corners seem to hold their breath, waiting for you to notice them.";
  }
  if (STATE.roomId === "foyer" && hasFlag("candle_lit")) {
    text += " The candlelight makes the portraits look less alive—and somehow more judgmental.";
  }
  if (visitedCount > 1) {
    text += " The place feels familiar now, which is its own kind of wrong.";
  }

  return text;
}

function prettyChoice(intent) {
  if (intent.type === "move") {
    const toName = WORLD.rooms[intent.to]?.name || intent.to;
    return `Go ${intent.dir} toward ${toName}.`;
  }
  if (intent.type === "take") {
    const nm = WORLD.items[intent.itemId]?.name || intent.itemId;
    return `Take the ${nm}.`;
  }
  if (intent.id === "UNLOCK_service") return "Use the brass key on the lock.";
  if (intent.id === "RATTLE_lock") return "Test the lock with a careful hand.";
  if (intent.id === "LIGHT_candle") return "Strike a match and light the candle.";
  if (intent.type === "inventory") return "Check inventory.";
  if (intent.type === "wait") return "Wait… and listen.";
  return intent.id;
}

/* ---------------------------
   IMAGE TRIGGER (for later AHK)
---------------------------- */
function emitImageTrigger(subject, beat) {
  const block =
`===IMAGE_TRIGGER===
subject: ${subject}
style: Victorian gothic engraving, ink etching, chiaroscuro, 19th-century illustration, dark fantasy
beat: ${beat}
constraints: no modern objects, no neon, no text, moody shadows, subtle fog
===END===`;
  addChron(block);
}

/* ---------------------------
   GPT OVERLAY APPLY
   Overlay JSON format:
   {
     "sceneText": "optional string",
     "choices": [{"id":"MOVE_south","text":"..."}]
   }
   Only keeps choices with IDs that are legal RIGHT NOW.
---------------------------- */
function getOverlayChoiceText(intentId) {
  if (!OVERLAY?.choices?.length) return null;
  const found = OVERLAY.choices.find(c => c && c.id === intentId && typeof c.text === "string");
  return found ? found.text : null;
}

function applyOverlayFromJsonText(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Overlay JSON could not be parsed. Make sure it's valid JSON.");
  }

  const sceneText = (typeof parsed.sceneText === "string") ? parsed.sceneText.trim() : null;
  const choices = Array.isArray(parsed.choices) ? parsed.choices : [];

  const legalSet = new Set(getLegalIntents().map(i => i.id));

  const filtered = choices
    .filter(c => c && typeof c.id === "string" && typeof c.text === "string")
    .map(c => ({ id: c.id.trim(), text: c.text.trim() }))
    .filter(c => c.id && c.text && legalSet.has(c.id));

  OVERLAY = { sceneText: sceneText || null, choices: filtered, ts: Date.now() };
  saveOverlay();

  return { accepted: filtered.length, legal: legalSet.size };
}

/* ---------------------------
   APPLY INTENT (mechanics)
---------------------------- */
function applyIntent(intent) {
  // Any player action consumes overlay (it was "for this moment")
  clearOverlay();

  // turn + visits
  STATE.turn += 1;
  STATE.visited[STATE.roomId] = (STATE.visited[STATE.roomId] || 0) + 1;

  const r = room();

  // first visit milestone
  if (r.firstVisitMilestone && !STATE.milestones[r.firstVisitMilestone]) {
    STATE.milestones[r.firstVisitMilestone] = true;
    emitImageTrigger(r.name, r.descSeed);
  }

  if (intent.type === "move") {
    STATE.roomId = intent.to;
    addChron(`Turn ${STATE.turn}: Moved ${intent.dir.toUpperCase()} to ${WORLD.rooms[intent.to]?.name || intent.to}.`);
    saveState();
    render();
    return;
  }

  if (intent.type === "take") {
    const itemId = intent.itemId;
    const here = room(); // (after move? no, same room)
    if ((here.items || []).includes(itemId)) {
      here.items = here.items.filter(x => x !== itemId);
      STATE.inventory.push(itemId);
      addChron(`Turn ${STATE.turn}: Took ${WORLD.items[itemId]?.name || itemId}.`);
    } else {
      addChron(`Turn ${STATE.turn}: Tried to take ${itemId}, but it wasn't there.`);
    }
    saveState();
    render();
    return;
  }

  if (intent.type === "unlock") {
    setFlag(intent.flag, true);
    addChron(`Turn ${STATE.turn}: Unlocked the service door.`);
    saveState();
    render();
    return;
  }

  if (intent.type === "misc" && intent.action === "rattle_lock") {
    addChron(`Turn ${STATE.turn}: The lock refuses you. It sounds… pleased.`);
    saveState();
    render();
    return;
  }

  if (intent.type === "use" && intent.action === "light_candle") {
    setFlag("candle_lit", true);
    addChron(`Turn ${STATE.turn}: Lit the candle.`);
    emitImageTrigger("Candlelight", "A candle flares to life, casting harsh, honest shadows.");
    saveState();
    render();
    return;
  }

  if (intent.type === "inventory") {
    addChron(`Turn ${STATE.turn}: Checked inventory.`);
    saveState();
    showDrawer("Inventory", inventoryText());
    return;
  }

  if (intent.type === "wait") {
    addChron(`Turn ${STATE.turn}: Waited. The estate waited back.`);
    saveState();
    render();
    return;
  }

  addChron(`Turn ${STATE.turn}: Did ${intent.id}.`);
  saveState();
  render();
}

/* ---------------------------
   TEXT HELPERS
---------------------------- */
function inventoryText() {
  if (STATE.inventory.length === 0) return "You carry nothing but your nerve.";
  let out = "You carry:\n";
  for (const id of STATE.inventory) out += `- ${WORLD.items[id]?.name || id}\n`;
  out += "\nItem notes:\n";
  for (const id of STATE.inventory) {
    const it = WORLD.items[id];
    if (it?.examine) out += `\n${it.name}:\n${it.examine}\n`;
  }
  return out.trim();
}

/* ---------------------------
   RENDER
---------------------------- */
function render() {
  const sceneEl = document.getElementById("scene");
  const metaEl = document.getElementById("meta");
  const choicesEl = document.getElementById("choices");

  if (!sceneEl || !metaEl || !choicesEl) return;

  const r = room();
  const intents = getLegalIntents();

  // Scene text: overlay if present, else baseline narration
  sceneEl.textContent =
    (OVERLAY?.sceneText && OVERLAY.sceneText.length)
      ? OVERLAY.sceneText
      : narrateScene();

  // Meta line
  const visible = (r.items || []).map(id => WORLD.items[id]?.name || id);
  metaEl.textContent =
    `${r.name} • Turn ${STATE.turn} • ` +
    (visible.length ? `You notice: ${visible.join(", ")}.` : `Nothing obvious presents itself.`);

  // Choices
  choicesEl.innerHTML = "";

  for (let i = 0; i < intents.length && i < 9; i++) {
    const intent = intents[i];
    const btn = document.createElement("button");
    btn.className = "choice";

    const overlayText = getOverlayChoiceText(intent.id);
    btn.textContent = `${i + 1}) ${overlayText || prettyChoice(intent)}`;

    btn.onclick = () => {
      hideDrawer();
      applyIntent(intent);
    };

    choicesEl.appendChild(btn);
  }

  saveState();
}

/* ---------------------------
   INPUT: 1-9 + I/C
---------------------------- */
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  if (e.key >= "1" && e.key <= "9") {
    const i = parseInt(e.key, 10) - 1;
    const intents = getLegalIntents();
    if (intents[i]) {
      hideDrawer();
      applyIntent(intents[i]);
    }
  }

  if (e.key.toLowerCase() === "i") {
    showDrawer("Inventory", inventoryText());
  }

  if (e.key.toLowerCase() === "c") {
    showDrawer("Chronicle", STATE.chronicle.slice(-120).join("\n\n"));
  }

  if (e.key === "Escape") {
    hideDrawer();
  }
});

/* ---------------------------
   BUTTONS (must exist in index.html)
---------------------------- */
function bindButtons() {
  const btnInv = document.getElementById("btnInv");
  const btnChron = document.getElementById("btnChron");
  const btnSave = document.getElementById("btnSave");
  const btnReset = document.getElementById("btnReset");
  const btnOverlay = document.getElementById("btnOverlay");

  if (btnInv) btnInv.onclick = () => showDrawer("Inventory", inventoryText());

  if (btnChron) btnChron.onclick = () =>
    showDrawer("Chronicle", STATE.chronicle.slice(-120).join("\n\n"));

  if (btnSave) btnSave.onclick = () => {
    saveState();
    showDrawer("Saved", "State saved to localStorage.");
  };

  if (btnReset) btnReset.onclick = () => {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(OVERLAY_KEY);
    STATE = defaultState();
    OVERLAY = null;
    showDrawer("Reset", "Hard reset done. Reloading scene…");
    render();
  };

  // GPT Overlay: paste JSON and apply
  if (btnOverlay) btnOverlay.onclick = () => {
    const legalIds = getLegalIntents().map(x => x.id);

    const template = {
      sceneText: "Optional: Replace the scene narration for this moment.",
      choices: legalIds.map(id => ({ id, text: `Gothic text for ${id}...` }))
    };

    const pasted = prompt(
      `Paste GPT overlay JSON here.\n\nLegal intent IDs right now:\n${legalIds.join(", ")}\n\nTip: IDs must match EXACTLY.`,
      JSON.stringify(template, null, 2)
    );

    if (pasted === null) return; // user cancelled
    if (!pasted.trim()) return;

    try {
      const res = applyOverlayFromJsonText(pasted);
      addChron(`Overlay applied: accepted ${res.accepted}/${res.legal} choices.`);
      render();
    } catch (err) {
      alert(err?.message || String(err));
    }
  };
}

/* ---------------------------
   BOOT
---------------------------- */
bindButtons();
render();

// Handy for you in console:
window.getLegalIntents = getLegalIntents;

