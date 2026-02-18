/* Gothic Chronicle — deterministic engine + overlays + images
   - Deterministic world: rooms/items/flags are truth
   - Overlay layer:
        * AUTO overlay (default): generates gothic narration + choice text every render
        * Manual GPT overlay button: paste JSON to override (one turn only)
   - Images:
        * Loads from Cloudflare Worker endpoint (keeps API keys secret)
   - Save: localStorage
*/

const SAVE_KEY    = "gothicChronicle.save.v1";
const OVERLAY_KEY = "gothicChronicle.overlay.v1";

// ====== CONFIG ======
const AUTO_NARRATOR = true;
const AUTO_IMAGES   = true;

// Put your deployed Worker base URL here AFTER you deploy from home, e.g.
// const CF_IMAGE_BASE = "https://gothic-chronicle-images.yoursubdomain.workers.dev/image";
const CF_IMAGE_BASE =  "https://orange-mountain-fd73.rich-gothic.workers.dev/image"; // 

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
        east:  { to: "wallpath" }
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
        east:  { to: "library", requiresFlag: "candle_lit" }
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
let OVERLAY = loadOverlay(); // { sceneText?:string|null, choices?:[{id,text}], ts?:number, manual?:boolean }

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
function room() { return WORLD.rooms[STATE.roomId]; }
function hasItem(itemId) { return STATE.inventory.includes(itemId); }
function hasFlag(flag) { return !!STATE.flags[flag]; }
function setFlag(flag, val = true) { STATE.flags[flag] = !!val; }

function addChron(entry) {
  STATE.chronicle.push(entry);
  if (STATE.chronicle.length > 500) STATE.chronicle.shift();
}

/* ---------------------------
   UI DRAWER
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
   INTENTS
---------------------------- */
function getLegalIntents() {
  const r = room();
  const intents = [];

  for (const [dir, ex] of Object.entries(r.exits || {})) {
    if (ex.requiresFlag && !hasFlag(ex.requiresFlag)) continue;
    intents.push({ id: `MOVE_${dir}`, type: "move", dir, to: ex.to });
  }

  for (const it of (r.items || [])) {
    intents.push({ id: `TAKE_${it}`, type: "take", itemId: it });
  }

  if (STATE.roomId === "servicedoor") {
    const lock = r.lock;
    if (lock && !hasFlag(lock.flagToSet)) {
      if (hasItem(lock.keyItem)) intents.push({ id: "UNLOCK_service", type: "unlock", flag: lock.flagToSet });
      else intents.push({ id: "RATTLE_lock", type: "misc", action: "rattle_lock" });
    }
  }

  const hasCandleVisibleOrHeld = (r.items || []).includes("candle") || hasItem("candle");
  if (hasItem("matchbook") && hasCandleVisibleOrHeld && !hasFlag("candle_lit")) {
    intents.push({ id: "LIGHT_candle", type: "use", action: "light_candle" });
  }

  intents.push({ id: "INVENTORY", type: "inventory" });
  intents.push({ id: "WAIT", type: "wait" });

  return intents;
}

/* ---------------------------
   BASE NARRATION
---------------------------- */
function narrateSceneBase() {
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

function prettyChoiceBase(intent) {
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
   AUTO NARRATOR (local gothic overlay)
---------------------------- */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildAutoOverlay(intents) {
  const r = room();
  const visible = (r.items || []).map(id => WORLD.items[id]?.name || id);
  const invCount = STATE.inventory.length;

  const openers = [
    `In ${r.name}, the air sits heavy as velvet.`,
    `You linger in ${r.name}. The quiet here is not empty.`,
    `${r.name} receives you without welcome.`,
    `Within ${r.name}, even your breath sounds like a confession.`
  ];

  const addVisible = visible.length
    ? pick([
        `Something catches your eye: ${visible.join(", ")}.`,
        `You notice ${visible.join(", ")}—as if placed for you.`,
        `Among the gloom: ${visible.join(", ")}.`
      ])
    : pick([
        "Nothing obvious offers itself—only the shape of absence.",
        "No clear object calls to you; the place keeps its secrets.",
        "There is little to take, and too much to imagine."
      ]);

  const addInv = invCount
    ? pick([
        `Your pockets feel heavier with memory.`,
        `You carry proof that the world is real.`,
        `You are not empty-handed, though it may not matter.`
      ])
    : pick([
        `You are nearly unarmed—except for stubbornness.`,
        `You carry nothing but nerve and questions.`,
        `Your hands are empty, and the house knows it.`
      ]);

  const tags = new Set(r.tags || []);
  const addMood =
    tags.has("fog") ? "Fog presses close, eager to be mistaken for a hand." :
    tags.has("moonlight") ? "Moonlight sketches sharp truths across broken stone." :
    tags.has("books") ? "Dust and paper conspire to make time feel trapped." :
    tags.has("lock") ? "The lock looks older than the door, and more certain." :
    "The shadows arrange themselves like an audience.";

  const sceneText = [pick(openers), addMood, addVisible, addInv].join(" ");

  const choiceRewrites = intents.map(intent => ({
    id: intent.id,
    text: gothicChoiceText(intent)
  }));

  return { sceneText, choices: choiceRewrites, ts: Date.now(), manual: false };
}

function gothicChoiceText(intent) {
  if (intent.type === "move") {
    const toName = WORLD.rooms[intent.to]?.name || intent.to;
    const dir = intent.dir.toLowerCase();
    const map = {
      north: [
        `Press north into ${toName}.`,
        `Go north—into ${toName}, where the air feels thinner.`,
        `Step north toward ${toName}, and do not look back.`
      ],
      south: [
        `Withdraw south toward ${toName}.`,
        `Retreat south to ${toName}, unwillingly.`,
        `Back away south toward ${toName}, eyes still searching.`
      ],
      east: [
        `Slip east toward ${toName}.`,
        `Go east to ${toName}, keeping close to the wall.`,
        `Move east into ${toName}, as quietly as you can manage.`
      ],
      west: [
        `Head west toward ${toName}.`,
        `Go west to ${toName}, the shadows following.`,
        `Step west to ${toName}, listening as you go.`
      ]
    };
    return pick(map[dir] || [`Go ${dir} to ${toName}.`]);
  }

  if (intent.type === "take") {
    const nm = WORLD.items[intent.itemId]?.name || intent.itemId;
    return pick([
      `Take the ${nm.toLowerCase()}.`,
      `Pocket the ${nm.toLowerCase()} before the house notices.`,
      `Lift the ${nm.toLowerCase()}—carefully.`
    ]);
  }

  if (intent.id === "UNLOCK_service") return pick([
    "Turn the brass key—slowly—until the lock gives in.",
    "Try the brass key in the lock, and listen for the click.",
    "Offer the brass key to the door and see if it accepts you."
  ]);

  if (intent.id === "RATTLE_lock") return pick([
    "Test the lock with a careful hand.",
    "Touch the lock—just enough to learn its mood.",
    "Rattle the handle softly, as if asking permission."
  ]);

  if (intent.id === "LIGHT_candle") return pick([
    "Strike a match and wake the candle’s thin flame.",
    "Light the candle. Give the dark a name.",
    "Bring fire to the wick and watch the shadows confess."
  ]);

  if (intent.type === "inventory") return pick([
    "Check your belongings—confirm what is real.",
    "Search your pockets for anything that defies this place.",
    "Take stock of what you carry, and what it costs."
  ]);

  if (intent.type === "wait") return pick([
    "Wait… and listen.",
    "Hold still. Let the silence speak first.",
    "Pause a moment—watching, breathing, counting heartbeats."
  ]);

  return prettyChoiceBase(intent);
}

/* ---------------------------
   IMAGE: Cloudflare Worker endpoint
---------------------------- */
function ensureSceneImageElement() {
  const sceneEl = document.getElementById("scene");
  if (!sceneEl) return null;

  let img = document.getElementById("sceneImage");
  if (!img) {
    img = document.createElement("img");
    img.id = "sceneImage";
    img.alt = "Scene illustration";
    img.loading = "lazy";
    img.style.width = "100%";
    img.style.borderRadius = "12px";
    img.style.marginBottom = "12px";
    img.style.border = "1px solid #1e1e1e";
    img.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
    img.onerror = () => { img.style.display = "none"; };
    img.onload  = () => { img.style.display = "block"; };
    sceneEl.parentNode.insertBefore(img, sceneEl);
  }
  return img;
}

function imageUrlForRoom(roomId) {
  if (!CF_IMAGE_BASE) return "";

  const flags = Object.keys(STATE.flags)
    .filter(k => STATE.flags[k])
    .sort()
    .join(",");

  const miles = Object.keys(STATE.milestones)
    .filter(k => STATE.milestones[k])
    .sort()
    .join(",");

  // deterministic signature — image changes only when real state changes
  const stateSig = `f:${flags}|m:${miles}`;

  return `${CF_IMAGE_BASE}?room=${encodeURIComponent(roomId)}&seed=${encodeURIComponent(roomId)}&state=${encodeURIComponent(stateSig)}`;
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
   MANUAL GPT OVERLAY (paste JSON)
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

  OVERLAY = { sceneText: sceneText || null, choices: filtered, ts: Date.now(), manual: true };
  saveOverlay();

  return { accepted: filtered.length, legal: legalSet.size };
}

/* ---------------------------
   APPLY INTENT
---------------------------- */
function applyIntent(intent) {
  clearOverlay();

  STATE.turn += 1;
  STATE.visited[STATE.roomId] = (STATE.visited[STATE.roomId] || 0) + 1;

  const r = room();

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
    const here = room();
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
  const sceneEl   = document.getElementById("scene");
  const metaEl    = document.getElementById("meta");
  const choicesEl = document.getElementById("choices");

  if (!sceneEl || !metaEl || !choicesEl) return;

  const r = room();
  const intents = getLegalIntents();

  if (AUTO_NARRATOR && !OVERLAY) {
    OVERLAY = buildAutoOverlay(intents);
    saveOverlay();
  }

  if (AUTO_IMAGES) {
    const img = ensureSceneImageElement();
    if (img) {
      const url = imageUrlForRoom(STATE.roomId);
      if (url) img.src = url;
      else img.style.display = "none";
    }
  }

  sceneEl.textContent =
    (OVERLAY?.sceneText && OVERLAY.sceneText.length)
      ? OVERLAY.sceneText
      : narrateSceneBase();

  const visible = (r.items || []).map(id => WORLD.items[id]?.name || id);
  metaEl.textContent =
    `${r.name} • Turn ${STATE.turn} • ` +
    (visible.length ? `You notice: ${visible.join(", ")}.` : `Nothing obvious presents itself.`);

  choicesEl.innerHTML = "";
  for (let i = 0; i < intents.length && i < 9; i++) {
    const intent = intents[i];
    const btn = document.createElement("button");
    btn.className = "choice";

    const overlayText = getOverlayChoiceText(intent.id);
    btn.textContent = `${i + 1}) ${overlayText || prettyChoiceBase(intent)}`;

    btn.onclick = () => {
      hideDrawer();
      applyIntent(intent);
    };
    choicesEl.appendChild(btn);
  }

  saveState();
}

/* ---------------------------
   INPUT
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

  if (e.key.toLowerCase() === "i") showDrawer("Inventory", inventoryText());
  if (e.key.toLowerCase() === "c") showDrawer("Chronicle", STATE.chronicle.slice(-140).join("\n\n"));
  if (e.key === "Escape") hideDrawer();
});

/* ---------------------------
   BUTTONS
---------------------------- */
function bindButtons() {
  const btnInv     = document.getElementById("btnInv");
  const btnChron   = document.getElementById("btnChron");
  const btnSave    = document.getElementById("btnSave");
  const btnReset   = document.getElementById("btnReset");
  const btnOverlay = document.getElementById("btnOverlay");

  if (btnInv) btnInv.onclick = () => showDrawer("Inventory", inventoryText());

  if (btnChron) btnChron.onclick = () =>
    showDrawer("Chronicle", STATE.chronicle.slice(-140).join("\n\n"));

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

    if (pasted === null) return;
    if (!pasted.trim()) return;

    try {
      const res = applyOverlayFromJsonText(pasted);
      addChron(`Manual overlay applied: accepted ${res.accepted}/${res.legal} choices.`);
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

// Handy in console:
window.getLegalIntents = getLegalIntents;
