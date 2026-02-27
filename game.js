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
const CF_IMAGE_BASE = "https://gothic-chronicle-images.rich-gothic.workers.dev/image";

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
      firstVisitMilestone: "m_gate_first",
    },

    wallpath: {
      name: "Outer Wall Path",
      descSeed: "You follow stonework slick with damp. The wall rises like a mute witness.",
      exits: { west: { to: "gate" }, north: { to: "servicedoor" } },
      items: [],
      tags: ["outdoors", "stone", "quiet"],
      firstVisitMilestone: "m_wallpath_first",
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
      lock: { flagToSet: "service_unlocked", keyItem: "brass_key" },
      firstVisitMilestone: "m_servicedoor_first",
    },

    courtyard: {
      name: "Courtyard",
      descSeed: "Moonlight spills across cracked stones. A fountain sits at the center, its water dark and still.",
      exits: { south: { to: "gate" }, north: { to: "foyer" } },
      items: ["brass_key"],
      tags: ["outdoors", "moonlight", "fountain"],
      firstVisitMilestone: "m_courtyard_first",
    },

    kitchen: {
      name: "Kitchen",
      descSeed: "The kitchen smells of cold ash and old herbs. Hooks hang from the beams. A butcher’s block dominates the room.",
      exits: { south: { to: "servicedoor" } },
      items: ["matchbook", "candle"],
      tags: ["indoors", "ash", "hooks", "butcherblock"],
      firstVisitMilestone: "m_kitchen_first",
    },

    foyer: {
      name: "Foyer",
      descSeed: "A grand foyer yawns open, its chandeliers dead. Portrait eyes follow you with oily patience.",
      exits: { south: { to: "courtyard" } },
      items: [],
      tags: ["indoors", "portraits", "dust"],
      firstVisitMilestone: "m_foyer_first",
    },

    chapel: {
      name: "Chapel",
      descSeed: "A chapel, half-swallowed by the estate. Candles lie like bones across the pews. The altar feels… awake.",
      exits: { west: { to: "foyer" } },
      items: ["silver_seal"],
      tags: ["indoors", "altar", "cold"],
      lock: { flagToSet: "crypt_unlocked", keyItem: "silver_seal" },
      firstVisitMilestone: "m_chapel_first",
    },

    library: {
      name: "Library",
      descSeed: "Books rot in their rows. A lectern waits like a verdict. Dust hangs in the air like a held breath.",
      exits: { east: { to: "foyer" } },
      items: [],
      tags: ["indoors", "books", "silence"],
      firstVisitMilestone: "m_library_first",
    },
  },

  items: {
    old_note: {
      name: "Old Note",
      examine:
        "A damp paper scrap. The ink is smeared, but one line remains:\n\n“Do not light a candle you cannot extinguish.”",
    },

    brass_key: {
      name: "Brass Key",
      examine:
        "A heavy brass key, warm despite the cold air. Its teeth are worn as if used countless times.",
    },

    matchbook: {
      name: "Matchbook",
      examine:
        "A small matchbook with a faded emblem. The striker feels gritty under your thumb.",
    },

    candle: {
      name: "Candle",
      examine:
        "A wax candle with a blackened wick. It seems older than the room that holds it.",
    },

    silver_seal: {
      name: "Silver Seal",
      examine:
        "A silver seal heavy with age. Its surface is etched with a crest that looks familiar—like a family you never had.",
    },
  }
};

/* ---------------------------
 STATE (deterministic)
---------------------------- */

let OVERLAY = null;

const STATE = {
  roomId: "gate",
  inventory: [],
  flags: {},
  milestones: {},
  visited: {},
  turn: 0,
};

function hasFlag(flag) { return !!STATE.flags[flag]; }
function setFlag(flag, value = true) { STATE.flags[flag] = !!value; }

function hasItem(itemId) { return (STATE.inventory || []).includes(itemId); }

function room() { return WORLD.rooms[STATE.roomId]; }

function getRoomItemIds(roomId) {
  const base = WORLD.rooms[roomId]?.items || [];
  const taken = (STATE.taken && STATE.taken[roomId]) ? STATE.taken[roomId] : {};
  return base.filter(it => !taken[it]);
}

function markTaken(roomId, itemId) {
  if (!STATE.taken) STATE.taken = {};
  if (!STATE.taken[roomId]) STATE.taken[roomId] = {};
  STATE.taken[roomId][itemId] = true;
}

function addChron(text) {
  const chron = JSON.parse(localStorage.getItem("gothicChronicle.chronicle.v1") || "[]");
  chron.push(text);
  localStorage.setItem("gothicChronicle.chronicle.v1", JSON.stringify(chron));
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    roomId: STATE.roomId,
    inventory: STATE.inventory,
    flags: STATE.flags,
    milestones: STATE.milestones,
    visited: STATE.visited,
    turn: STATE.turn,
    taken: STATE.taken || {},
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    STATE.roomId = data.roomId || STATE.roomId;
    STATE.inventory = Array.isArray(data.inventory) ? data.inventory : [];
    STATE.flags = data.flags || {};
    STATE.milestones = data.milestones || {};
    STATE.visited = data.visited || {};
    STATE.turn = Number.isFinite(data.turn) ? data.turn : 0;
    STATE.taken = data.taken || {};
  } catch {
    // ignore
  }
}

function clearOverlay() {
  OVERLAY = null;
  saveOverlay();
}

function saveOverlay() {
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(OVERLAY));
}

function loadOverlay() {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    if (!raw) return;
    OVERLAY = JSON.parse(raw);
  } catch {
    OVERLAY = null;
  }
}

/* ---------------------------
 IMAGE + PROMPT SIGNATURE
---------------------------- */

function ensureSceneImageElement() {
  const mount = document.getElementById("sceneImageMount");
  if (!mount) return null;

  let wrap = document.getElementById("sceneImageWrap");
  let img  = document.getElementById("sceneImage");

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "sceneImageWrap";
    wrap.className = "frame-wrap";
    mount.appendChild(wrap);
  }

  if (!img) {
    img = document.createElement("img");
    img.id = "sceneImage";
    img.alt = "Scene image";
    img.loading = "eager";
    img.decoding = "async";

    img.onerror = () => { wrap.style.display = "none"; };
    img.onload  = () => {
      wrap.style.display = "block";
      requestAnimationFrame(() => img.classList.add("is-loaded"));
    };

    wrap.appendChild(img);
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

  const IMAGE_PROMPT_VERSION = 22; // bump this whenever prompt logic changes

 const stateSig = `f:${flags}|m:${miles}`;
 return `${CF_IMAGE_BASE}?room=${encodeURIComponent(roomId)}&seed=${encodeURIComponent(roomId)}&state=${encodeURIComponent(stateSig)}&v=${IMAGE_PROMPT_VERSION}&t=${Date.now()}`;
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

  // Turn advances on every action
  STATE.turn += 1;

  // Helper: fire "first visit" milestone for the CURRENT roomId
  function handleFirstVisitForCurrentRoom() {
    const rNow = room();
    // count visit
    STATE.visited[STATE.roomId] = (STATE.visited[STATE.roomId] || 0) + 1;

    if (rNow.firstVisitMilestone && !STATE.milestones[rNow.firstVisitMilestone]) {
      STATE.milestones[rNow.firstVisitMilestone] = true;
      emitImageTrigger(rNow.name, rNow.descSeed);
    }
  }

  if (intent.type === "move") {
    const fromId = STATE.roomId;

    // Move first (so "arrival" milestones/triggers are correct)
    STATE.roomId = intent.to;

    addChron(`Turn ${STATE.turn}: Moved ${intent.dir.toUpperCase()} to ${WORLD.rooms[intent.to]?.name || intent.to}.`);

    // Arrival visit + arrival milestone image trigger
    handleFirstVisitForCurrentRoom();

    saveState();
    render();
    return;
  }

  // Non-move actions happen "in place"
  handleFirstVisitForCurrentRoom();

  const r = room();

  if (intent.type === "take") {
    const itemId = intent.itemId;
    const hereItems = getRoomItemIds(STATE.roomId);
    if (hereItems.includes(itemId)) {
      markTaken(STATE.roomId, itemId);
      STATE.inventory.push(itemId);
      addChron(`Turn ${STATE.turn}: Took ${WORLD.items[itemId]?.name || itemId}.`);

      // ✅ Courtyard ghost appears AFTER taking the brass key (not on arrival)
      if (STATE.roomId === "courtyard" && itemId === "brass_key" && !hasFlag("courtyard_ghost_seen")) {
        setFlag("courtyard_ghost_seen", true);

        emitImageTrigger(
          "Courtyard Apparition",
          "The brass key warms in your palm. The fountain’s black water trembles—then stills. In the moonlit mist, a figure resolves beside the cracked basin, too tall, too pale, and watching you as if you were late."
        );

        addChron(`Turn ${STATE.turn}: The apparition appeared after taking the brass key.`);

        playCutscene(
          "The brass key warms in your palm.\n\nThe fountain’s black water trembles—then stills.\n\nAnd in the moonlit mist, a figure resolves beside the cracked basin—too tall, too pale—its face unfinished, as if memory refused to complete it.\n\nIt does not approach.\n\nIt simply stands there… certain you can see it.",
          "Steady your breath…"
        );
      }

      // ✅ Kitchen butcher appears AFTER taking the matchbook
      if (STATE.roomId === "kitchen" && itemId === "matchbook" && !hasFlag("kitchen_butcher_seen")) {
        setFlag("kitchen_butcher_seen", true);

        emitImageTrigger(
          "Kitchen — The Butcher",
          "The matchbook’s dry rasp sounds too loud in the cold hearth. A hook sways without reason. Then—slowly—someone steps into the edge of the firelight: a cook’s apron stained dark, a cleaver hanging at their side like a confession. They do not speak. They only watch you measure your next breath."
        );

        addChron(`Turn ${STATE.turn}: A butcher-like figure revealed itself in the kitchen.`);
      }

    } else {
      addChron(`Turn ${STATE.turn}: Tried to take ${itemId}, but it wasn't there.`);
    }
    saveState();
    render();
    return;
  }

  if (intent.type === "examine") {
    const it = WORLD.items[intent.itemId];
    const title = it?.name || intent.itemId;
    const body  = it?.examine || "Nothing more yields itself.";
    addChron(`Turn ${STATE.turn}: Examined ${title}.`);
    saveState();
    showDrawer(title, body);
    return;
  }

  if (intent.type === "misc" && intent.action === "open_gate") {
    setFlag("gate_unlocked", true);
    addChron(`Turn ${STATE.turn}: The iron gate gives way. The estate accepts the sound.`);
    emitImageTrigger("Iron Gate Opening", "A rusted iron gate groans open as fog pours through like something alive.");
    saveState();
    render();
    return;
  }

  if (intent.type === "unlock") {
    if (intent.flag === "service_unlocked") {
      setFlag("service_unlocked", true);
      addChron(`Turn ${STATE.turn}: Unlocked the service door.`);
      saveState();
      render();
      return;
    }

    if (intent.flag === "crypt_unlocked") {
      setFlag("crypt_unlocked", true);
      addChron(`Turn ${STATE.turn}: Unlocked the chapel’s hidden trapdoor.`);
      emitImageTrigger("Chapel Trapdoor", "A concealed trapdoor near the altar opens into darkness below, as cold air spills upward.");
      saveState();
      render();
      return;
    }

    setFlag(intent.flag, true);
    addChron(`Turn ${STATE.turn}: Unlocked ${intent.flag}.`);
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

  if (intent.type === "misc" && intent.action === "kneel_altar") {
    addChron(`Turn ${STATE.turn}: You kneel. The altar does not forgive you. Something beneath the boards shifts—once.`);
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

  if (intent.type === "use" && intent.action === "place_seal") {
    setFlag("seal_placed", true);
    addChron(`Turn ${STATE.turn}: Placed the Silver Seal on the lectern. Stone answered.`);
    emitImageTrigger("Sealed Passage", "A silver seal is set upon a lectern; hidden stonework slides aside, revealing a passage.");
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

  // ✅ Cutscene continue
  if (intent.id === "CUTSCENE_CONTINUE") {
    clearOverlay();
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
      if (url) {
        img.style.display = "";
        img.src = url;
      } else {
        img.style.display = "none";
      }
    }
  }

  sceneEl.textContent =
    (OVERLAY?.sceneText && OVERLAY.sceneText.length)
      ? OVERLAY.sceneText
      : narrateSceneBase();

  metaEl.textContent = `Location: ${r.name} • Turn: ${STATE.turn}`;

  // Render choices
  choicesEl.innerHTML = "";
  for (const it of intents) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = getOverlayChoiceText(it.id) || prettyChoiceBase(it);
    btn.addEventListener("click", () => applyIntent(it));
    choicesEl.appendChild(btn);
  }

  // Clear manual overlay after one render
  if (OVERLAY?.manual) {
    OVERLAY = null;
    saveOverlay();
  }
}

/* ---------------------------
 CUTSCENE OVERLAY HELPERS
---------------------------- */
function playCutscene(text, continueText = "Continue") {
  OVERLAY = {
    sceneText: text,
    choices: [{ id: "CUTSCENE_CONTINUE", text: continueText }],
    ts: Date.now(),
    manual: false,
  };
  saveOverlay();
}

function showDrawer(title, body) {
  const drawer = document.getElementById("drawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerBody  = document.getElementById("drawerBody");
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

  // movement (only if requirements satisfied)
  for (const [dir, ex] of Object.entries(r.exits || {})) {
    if (ex.requiresFlag && !hasFlag(ex.requiresFlag)) continue;
    intents.push({ id: `MOVE_${dir}`, type: "move", dir, to: ex.to });
  }

  // take items in room (state-filtered)
  for (const it of getRoomItemIds(STATE.roomId)) {
    intents.push({ id: `TAKE_${it}`, type: "take", itemId: it });
  }

  // EXAMINE items in room
  for (const it of getRoomItemIds(STATE.roomId)) {
    intents.push({ id: `EXAMINE_${it}`, type: "examine", itemId: it, where: "room" });
  }

  // EXAMINE items in inventory
  for (const it of (STATE.inventory || [])) {
    intents.push({ id: `EXAMINE_INV_${it}`, type: "examine", itemId: it, where: "inv" });
  }

  // Iron Gate: OPEN action
  if (STATE.roomId === "gate" && !hasFlag("gate_unlocked")) {
    intents.push({ id: "OPEN_gate", type: "misc", action: "open_gate" });
  }

  // Service Door lock behavior
  if (STATE.roomId === "servicedoor") {
    const lock = r.lock;
    if (lock && !hasFlag(lock.flagToSet)) {
      if (hasItem(lock.keyItem)) intents.push({ id: "UNLOCK_service", type: "unlock", flag: lock.flagToSet });
      else intents.push({ id: "RATTLE_lock", type: "misc", action: "rattle_lock" });
    }
  }

  // Chapel trapdoor lock behavior
  if (STATE.roomId === "chapel") {
    const lock = r.lock;
    if (lock && !hasFlag(lock.flagToSet)) {
      if (hasItem(lock.keyItem)) intents.push({ id: "UNLOCK_crypt", type: "unlock", flag: lock.flagToSet });
      else intents.push({ id: "KNEEL_altar", type: "misc", action: "kneel_altar" });
    }
  }

  // Candle lighting intent
  const roomItems = getRoomItemIds(STATE.roomId);
  const hasCandleVisibleOrHeld = roomItems.includes("candle") || hasItem("candle");
  if (hasItem("matchbook") && hasCandleVisibleOrHeld && !hasFlag("candle_lit")) {
    intents.push({ id: "LIGHT_candle", type: "use", action: "light_candle" });
  }

  // Library puzzle
  if (STATE.roomId === "library" && hasItem("silver_seal") && !hasFlag("seal_placed")) {
    intents.push({ id: "PLACE_seal", type: "use", action: "place_seal" });
  }

  intents.push({ id: "INVENTORY", type: "inventory" });
  intents.push({ id: "WAIT", type: "wait" });

  return intents;
}

/* ---------------------------
 AUTO OVERLAY (narration)
---------------------------- */

function narrateSceneBase() {
  const r = room();

  // Base scene seed
  let text = r.descSeed;

  // Flavor if ghost has been seen
  if (STATE.roomId === "courtyard" && hasFlag("courtyard_ghost_seen")) {
    text += "\n\nThe air tastes of iron and old water. Something watches from the edge of the fountain’s shadow.";
  }

  // Candlelit flavor
  if (hasFlag("candle_lit")) {
    text += "\n\nWarm candlelight fights the estate’s hunger for shadow.";
  }

  return text;
}

function buildAutoOverlay(intents) {
  // Default: just base narration; choices come from prettyChoiceBase
  return {
    sceneText: narrateSceneBase(),
    choices: intents.map(i => ({ id: i.id, text: prettyChoiceBase(i) })),
    ts: Date.now(),
    manual: false,
  };
}

function prettyChoiceBase(intent) {
  // Default readable labels
  if (intent.type === "move") return `Go ${intent.dir.toUpperCase()} → ${WORLD.rooms[intent.to]?.name || intent.to}`;
  if (intent.type === "take") return `Take ${WORLD.items[intent.itemId]?.name || intent.itemId}`;
  if (intent.type === "examine") {
    const it = WORLD.items[intent.itemId];
    const nm = it?.name || intent.itemId;
    return (intent.where === "inv") ? `Examine (Inventory): ${nm}` : `Examine: ${nm}`;
  }
  if (intent.type === "misc" && intent.action === "open_gate") return "Open the Iron Gate";
  if (intent.type === "misc" && intent.action === "rattle_lock") return "Rattle the lock";
  if (intent.type === "misc" && intent.action === "kneel_altar") return "Kneel at the altar";
  if (intent.type === "unlock" && intent.flag === "service_unlocked") return "Unlock the service door";
  if (intent.type === "unlock" && intent.flag === "crypt_unlocked") return "Unlock the trapdoor";
  if (intent.type === "use" && intent.action === "light_candle") return "Light the candle";
  if (intent.type === "use" && intent.action === "place_seal") return "Place the Silver Seal";
  if (intent.type === "inventory") return "Inventory";
  if (intent.type === "wait") return "Wait";
  return intent.id || "…";
}

/* ---------------------------
 BOOT
---------------------------- */

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  loadOverlay();

  // Ensure first visit milestone for starting room
  // (only if not already recorded)
  if (!STATE.visited[STATE.roomId]) {
    // does NOT advance turn
    STATE.visited[STATE.roomId] = 0;
  }

  render();

  // Buttons
  const btnInv = document.getElementById("btnInv");
  const btnChron = document.getElementById("btnChron");
  const btnOverlay = document.getElementById("btnOverlay");
  const btnSave = document.getElementById("btnSave");
  const btnReset = document.getElementById("btnReset");

  btnInv?.addEventListener("click", () => {
    showDrawer("Inventory", inventoryText());
  });

  btnChron?.addEventListener("click", () => {
    const chron = JSON.parse(localStorage.getItem("gothicChronicle.chronicle.v1") || "[]");
    const body = chron.slice(-60).join("\n") || "(empty)";
    showDrawer("Chronicle (last 60)", body);
  });

  btnOverlay?.addEventListener("click", () => {
    const raw = prompt("Paste overlay JSON (one turn only). Leave empty to clear.");
    if (!raw) {
      clearOverlay();
      alert("Overlay cleared.");
      render();
      return;
    }
    try {
      const res = applyOverlayFromJsonText(raw);
      alert(`Overlay accepted: ${res.accepted} choices`);
      render();
    } catch (e) {
      alert(String(e?.message || e));
    }
  });

  btnSave?.addEventListener("click", () => {
    saveState();
    alert("Saved.");
  });

  btnReset?.addEventListener("click", () => {
    if (!confirm("Hard reset? This clears save + overlay + chronicle.")) return;
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(OVERLAY_KEY);
    localStorage.removeItem("gothicChronicle.chronicle.v1");
    location.reload();
  });

  // Keyboard shortcuts (1-9, Enter, I, C, Esc)
  window.addEventListener("keydown", (e) => {
    const drawer = document.getElementById("drawer");
    const isDrawerOpen = !!drawer?.open;

    if (e.key === "Escape" && isDrawerOpen) {
      hideDrawer();
      e.preventDefault();
      return;
    }

    if (e.key.toLowerCase() === "i") {
      showDrawer("Inventory", inventoryText());
      e.preventDefault();
      return;
    }

    if (e.key.toLowerCase() === "c") {
      const chron = JSON.parse(localStorage.getItem("gothicChronicle.chronicle.v1") || "[]");
      const body = chron.slice(-60).join("\n") || "(empty)";
      showDrawer("Chronicle (last 60)", body);
      e.preventDefault();
      return;
    }

    // Number keys choose options
    if (!isDrawerOpen && /^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const intents = getLegalIntents();
      if (intents[idx]) applyIntent(intents[idx]);
      e.preventDefault();
      return;
    }

    // Enter chooses first option
    if (!isDrawerOpen && e.key === "Enter") {
      const intents = getLegalIntents();
      if (intents[0]) applyIntent(intents[0]);
      e.preventDefault();
      return;
    }
  });
});
