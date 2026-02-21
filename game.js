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
      exits: {
        west: { to: "foyer" },
        north: { to: "sealedpassage", requiresFlag: "seal_placed" }
      },
      items: ["silver_seal"],
      tags: ["indoors", "books", "secrets"],
      firstVisitMilestone: "m_library_first"
    },

    sealedpassage: {
      name: "Sealed Passage",
      descSeed: "Behind the lectern, stone slides with a sigh. A passage breathes out dust that tastes like old prayers.",
      exits: { south: { to: "library" }, north: { to: "chapel" } },
      items: ["diary_page"],
      tags: ["indoors", "stone", "secrets"],
      firstVisitMilestone: "m_sealedpassage_first"
    },

    chapel: {
      name: "Chapel",
      descSeed: "A private chapel, abandoned but not empty. Candles have melted into grotesque stalagmites. The altar is stained dark.",
      exits: {
        south: { to: "sealedpassage" },
        east:  { to: "gallery" },
        down:  { to: "crypt", requiresFlag: "crypt_unlocked" }
      },
      items: ["rosary"],
      tags: ["indoors", "faith", "cold"],
      lock: { flagToSet: "crypt_unlocked", keyItem: "iron_key" },
      firstVisitMilestone: "m_chapel_first"
    },

    gallery: {
      name: "Gallery",
      descSeed: "Frames line the walls like windows into lives that never ended. One portrait’s eyes appear newly wet.",
      exits: { west: { to: "chapel" }, north: { to: "upperlanding" } },
      items: ["raven_feather"],
      tags: ["indoors", "portraits", "echo"],
      firstVisitMilestone: "m_gallery_first"
    },

    upperlanding: {
      name: "Upper Landing",
      descSeed: "The upper landing creaks like a held breath. Doors wait on both sides, polite as teeth.",
      exits: { south: { to: "gallery" }, east: { to: "masterbed" }, west: { to: "nursery" } },
      items: [],
      tags: ["indoors", "shadow", "quiet"],
      firstVisitMilestone: "m_upperlanding_first"
    },

    masterbed: {
      name: "Master Bedroom",
      descSeed: "A vast bed draped in ruined finery. The canopy hangs like mourning cloth. The mirror here refuses to feel honest.",
      exits: { west: { to: "upperlanding" } },
      items: ["iron_key"],
      tags: ["indoors", "silk", "wrong"],
      firstVisitMilestone: "m_masterbed_first"
    },

    nursery: {
      name: "Nursery",
      descSeed: "A nursery with a cradle that rocks in its own time. Toys sit arranged as if expecting applause.",
      exits: { east: { to: "upperlanding" }, down: { to: "foyer" } },
      items: ["music_box"],
      tags: ["indoors", "childhood", "stillness"],
      firstVisitMilestone: "m_nursery_first"
    },

    crypt: {
      name: "Crypt",
      descSeed: "Stone steps descend into a crypt where names have been scratched out. The air is colder than truth.",
      exits: { up: { to: "chapel" }, north: { to: "cellar" } },
      items: ["vial_ash"],
      tags: ["indoors", "stone", "dead"],
      firstVisitMilestone: "m_crypt_first"
    },

    cellar: {
      name: "Cellar",
      descSeed: "Casks rot in rows. The floor is damp, the walls sweating. A distant drip keeps time like a metronome for dread.",
      exits: { south: { to: "crypt" }, west: { to: "kitchen" } },
      items: ["cold_coins"],
      tags: ["indoors", "damp", "dark"],
      firstVisitMilestone: "m_cellar_first"
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
    },

    diary_page: {
      name: "Diary Page",
      examine:
        "A torn page, the handwriting tight with panic: “The seal is not a relic—it's a promise. Place it where words are weighed. Do not pray for mercy. Bargain for boundaries.”"
    },
    rosary: {
      name: "Rosary",
      examine:
        "Wooden beads darkened by touch. One bead is carved into a tiny thorned rose. It feels warm, as if recently held."
    },
    raven_feather: {
      name: "Raven Feather",
      examine:
        "A glossy black feather. It catches the light like oil on water. When you hold it, you can almost hear wings in the walls."
    },
    iron_key: {
      name: "Iron Key",
      examine:
        "A heavy iron key, pitted with age. It smells faintly of candle smoke and soil."
    },
    music_box: {
      name: "Music Box",
      examine:
        "A small music box shaped like a coffin. The crank resists, then yields—playing a melody you somehow already know."
    },
    vial_ash: {
      name: "Vial of Ash",
      examine:
        "A narrow glass vial filled with gray ash. The ash clings to the glass as if it hates falling."
    },
    cold_coins: {
      name: "Cold Coins",
      examine:
        "A handful of old coins, too cold for the room. Their faces are worn smooth, as if rubbed by anxious thumbs for decades."
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
    chronicle: [],
    // keep track of taken items so WORLD stays deterministic
    taken: {} // { [roomId]: { [itemId]: true } }
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

function isGameActive(){
  const game = document.getElementById("gameUI");
  return !!game && game.classList.contains("is-active");
}

function safeScrollToTop(){
  const sc = document.getElementById("gameScroll");
  if (!sc) return;
  // top of content (keeps scene visible)
  sc.scrollTop = 0;
}

/* ---------------------------
 ROOM ITEMS (deterministic WORLD + state-driven taken)
---------------------------- */
function getRoomItemIds(roomId){
  const base = WORLD.rooms[roomId]?.items || [];
  const takenMap = (STATE.taken && STATE.taken[roomId]) ? STATE.taken[roomId] : {};
  return base.filter(id => !takenMap[id]);
}

function markTaken(roomId, itemId){
  if (!STATE.taken) STATE.taken = {};
  if (!STATE.taken[roomId]) STATE.taken[roomId] = {};
  STATE.taken[roomId][itemId] = true;
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

  if (STATE.roomId === "library" && !hasFlag("seal_placed") && hasItem("silver_seal")) {
    text += " The lectern’s surface looks strangely clean—like it expects something to be set upon it.";
  }
  if (STATE.roomId === "library" && hasFlag("seal_placed")) {
    text += " The stone behind the lectern no longer looks like wall. It looks like a decision already made.";
  }

  if (visitedCount > 1) {
    text += " The place feels familiar now, which is its own kind of wrong.";
  }

  return text;
}

function prettyChoiceBase(intent) {
  if (intent.type === "move") {
  STATE.roomId = intent.to;

  addChron(`Turn ${STATE.turn}: Moved ${intent.dir.toUpperCase()} to ${WORLD.rooms[intent.to]?.name || intent.to}.`);

  // ✅ Courtyard ghost scene — fire once on first entry
  if (intent.to === "courtyard" && !hasFlag("courtyard_ghost_seen")) {
    setFlag("courtyard_ghost_seen", true);

    emitImageTrigger(
      "Courtyard Apparition",
      "As you step into the moonlit courtyard, an apparition forms near the cracked fountain—tall, pale, half-remembered. Fog coils around its feet like it belongs to the stone. The statues seem to watch."
    );

    addChron(`Turn ${STATE.turn}: Saw an apparition in the courtyard.`);
  }

  saveState();
  render();
  return;
}
  if (intent.type === "take") {
    const nm = WORLD.items[intent.itemId]?.name || intent.itemId;
    return `Take the ${nm}.`;
  }
  if (intent.type === "examine") {
    const nm = WORLD.items[intent.itemId]?.name || intent.itemId;
    return `Examine the ${nm}.`;
  }

  if (intent.id === "OPEN_gate") return "Strain the iron gate open.";
  if (intent.id === "UNLOCK_service") return "Use the brass key on the lock.";
  if (intent.id === "RATTLE_lock") return "Test the lock with a careful hand.";
  if (intent.id === "LIGHT_candle") return "Strike a match and light the candle.";
  if (intent.id === "PLACE_seal") return "Place the silver seal upon the lectern.";
  if (intent.id === "UNLOCK_crypt") return "Use the iron key on the chapel’s hidden lock.";
  if (intent.id === "KNEEL_altar") return "Kneel at the altar—just for a moment.";

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
  const visible = getRoomItemIds(STATE.roomId).map(id => WORLD.items[id]?.name || id);
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
    tags.has("faith") ? "Old prayers cling to the air like cobwebs with teeth." :
    tags.has("dead") ? "The cold here is personal, like a name spoken in stone." :
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
      ],
      up: [
        `Climb upward toward ${toName}.`,
        `Go up to ${toName}, letting the house watch you rise.`,
        `Ascend to ${toName}—each step a decision.`
      ],
      down: [
        `Descend into ${toName}.`,
        `Go down to ${toName}, where breath turns to doubt.`,
        `Step down into ${toName}, and feel the cold learn you.`
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

  if (intent.type === "examine") {
    const nm = WORLD.items[intent.itemId]?.name || intent.itemId;
    return pick([
      `Study the ${nm.toLowerCase()} closely.`,
      `Examine the ${nm.toLowerCase()}—as if it might confess.`,
      `Hold the ${nm.toLowerCase()} to the light and listen for meaning.`
    ]);
  }

  if (intent.id === "OPEN_gate") return pick([
    "Grip the iron and force the gate to remember it can move.",
    "Put your weight into the gate until it yields with a scream of rust.",
    "Open the gate—slowly—so the fog can’t accuse you of haste."
  ]);

  if (intent.id === "UNLOCK_service") return pick([
    "Turn the brass key—slowly—until the lock gives in.",
    "Try the brass key in the lock, and listen for the click.",
    "Offer the brass key to the door and see if it accepts you."
  ]);

  if (intent.id === "UNLOCK_crypt") return pick([
    "Turn the iron key. Let the chapel reveal what it hides.",
    "Use the iron key—slowly—until the trapdoor agrees.",
    "Unlock what faith tried to bury."
  ]);

  if (intent.id === "RATTLE_lock") return pick([
    "Test the lock with a careful hand.",
    "Touch the lock—just enough to learn its mood.",
    "Rattle the handle softly, as if asking permission."
  ]);

  if (intent.id === "KNEEL_altar") return pick([
    "Kneel at the altar and pretend you still believe in safety.",
    "Lower yourself before the altar—just long enough to regret it.",
    "Kneel and listen. Sometimes stone remembers names."
  ]);

  if (intent.id === "LIGHT_candle") return pick([
    "Strike a match and wake the candle’s thin flame.",
    "Light the candle. Give the dark a name.",
    "Bring fire to the wick and watch the shadows confess."
  ]);

  if (intent.id === "PLACE_seal") return pick([
    "Set the silver seal upon the lectern and see what stirs.",
    "Place the silver seal where words are weighed.",
    "Offer the seal to the lectern—boundary for boundary."
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
  const mount = document.getElementById("sceneImageMount");
  if (!mount) return null;

  let wrap = document.getElementById("sceneImageFrame");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "sceneImageFrame";
    wrap.className = "frame-wrap";

    const tl = document.createElement("div"); tl.className = "frame-corner tl";
    const tr = document.createElement("div"); tr.className = "frame-corner tr";
    const bl = document.createElement("div"); bl.className = "frame-corner bl";
    const br = document.createElement("div"); br.className = "frame-corner br";
    wrap.appendChild(tl); wrap.appendChild(tr); wrap.appendChild(bl); wrap.appendChild(br);

    mount.appendChild(wrap);
  }

  let img = document.getElementById("sceneImage");
  if (!img) {
    img = document.createElement("img");
    img.id = "sceneImage";
    img.alt = "Scene illustration";
    img.loading = "lazy";

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
    const hereItems = getRoomItemIds(STATE.roomId);
    if (hereItems.includes(itemId)) {
      markTaken(STATE.roomId, itemId);
      STATE.inventory.push(itemId);
      addChron(`Turn ${STATE.turn}: Took ${WORLD.items[itemId]?.name || itemId}.`);
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

  const visible = getRoomItemIds(STATE.roomId).map(id => WORLD.items[id]?.name || id);
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
      if (window.gcMusicKick) window.gcMusicKick();
      hideDrawer();
      applyIntent(intent);
    };

    choicesEl.appendChild(btn);
  }

  // keep content visible
  requestAnimationFrame(() => safeScrollToTop());
}

/* ---------------------------
 INPUT (bind once) — ✅ only active when game screen is active
---------------------------- */
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  // ✅ ignore unless gameUI is active
  if (!isGameActive()) return;

  if (e.key >= "1" && e.key <= "9") {
    const i = parseInt(e.key, 10) - 1;
    const intents = getLegalIntents();
    if (intents[i]) {
      hideDrawer();
      applyIntent(intents[i]);
    }
    return;
  }

  const k = e.key.toLowerCase();
  if (k === "i") showDrawer("Inventory", inventoryText());
  if (k === "c") showDrawer("Chronicle", STATE.chronicle.slice(-140).join("\n\n"));
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

  // Music UI
  const btnMusic   = document.getElementById("btnMusic");
  const bgm        = document.getElementById("bgm");
  const bgmVol     = document.getElementById("bgmVol");

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

    // stop music + clear prefs
    try {
      if (bgm) { bgm.pause(); bgm.currentTime = 0; }
      localStorage.removeItem("gothicChronicle.bgm.v1");
      localStorage.removeItem("gothicChronicle.bgmVol.v1");
      if (btnMusic) btnMusic.textContent = "Music: Off";
      if (bgmVol) bgmVol.value = "45";
    } catch {}

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

  // --- Music toggle + Autoplay on first interaction + Volume slider ---
  if (btnMusic && bgm) {
    const KEY_ON  = "gothicChronicle.bgm.v1";
    const KEY_VOL = "gothicChronicle.bgmVol.v1";

    if (localStorage.getItem(KEY_ON) === null) localStorage.setItem(KEY_ON, "1");

    const savedVol = parseInt(localStorage.getItem(KEY_VOL) || "45", 10);
    const volPct = Math.max(0, Math.min(100, isFinite(savedVol) ? savedVol : 45));
    if (bgmVol) bgmVol.value = String(volPct);

    let playing = false;

    function targetVolume() {
      const v = parseInt(localStorage.getItem(KEY_VOL) || String(volPct), 10);
      const clamped = Math.max(0, Math.min(100, isFinite(v) ? v : volPct));
      return clamped / 100;
    }

    function syncLabel() {
      const prefOn = localStorage.getItem(KEY_ON) === "1";
      btnMusic.textContent = (playing || prefOn) ? "Music: On" : "Music: Off";
    }

    async function start() {
      try {
        bgm.volume = 0;
        await bgm.play();

        playing = true;
        localStorage.setItem(KEY_ON, "1");
        syncLabel();

        const target = targetVolume();
        let v = 0;

        const fade = setInterval(() => {
          v += 0.02;
          bgm.volume = Math.min(v, target);
          if (v >= target) clearInterval(fade);
        }, 120);
      } catch {
        playing = false;
        syncLabel();
      }
    }

    function stop() {
      playing = false;
      localStorage.setItem(KEY_ON, "0");
      bgm.pause();
      bgm.currentTime = 0;
      syncLabel();
    }

    syncLabel();

    btnMusic.onclick = async () => {
      if (playing) stop();
      else await start();
    };

    if (bgmVol) {
      bgmVol.addEventListener("input", () => {
        const v = parseInt(bgmVol.value, 10);
        const clamped = Math.max(0, Math.min(100, isFinite(v) ? v : 45));
        localStorage.setItem(KEY_VOL, String(clamped));
        if (playing) bgm.volume = clamped / 100;
      });
    }

    window.gcMusicKick = async () => {
      if (localStorage.getItem(KEY_ON) !== "1") return;
      if (!playing) await start();
    };

    const firstKick = async () => { await window.gcMusicKick(); };

    window.addEventListener("touchstart", firstKick, { once: true, passive: true });
    window.addEventListener("click", firstKick, { once: true });
    window.addEventListener("pointerdown", firstKick, { once: true });
    window.addEventListener("keydown", firstKick, { once: true });
  }
}

/* ---------------------------
 BOOT
---------------------------- */
bindButtons();
render();

function showGame(fromContinue = false) {
  const title = document.getElementById("titleScreen");
  const game  = document.getElementById("gameUI");

  if (title) title.classList.remove("is-active");
  if (game)  game.classList.add("is-active");

  if (!fromContinue) {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(OVERLAY_KEY);
    STATE = defaultState();
    OVERLAY = null;
  } else {
    STATE = loadState();
    OVERLAY = loadOverlay();
  }

  render();
  if (window.gcMusicKick) window.gcMusicKick();
}

(function initTitleScreen() {
  const btnStart = document.getElementById("btnStart");
  const btnCont  = document.getElementById("btnContinue");

  function refreshContinueVisibility() {
    const hasSaveNow = !!localStorage.getItem(SAVE_KEY);
    if (btnCont) btnCont.style.display = hasSaveNow ? "" : "none";
    return hasSaveNow;
  }

  refreshContinueVisibility();

  if (btnStart) btnStart.addEventListener("click", () => showGame(false));
  if (btnCont)  btnCont.addEventListener("click", () => showGame(true));

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key !== "Enter") return;

    // only handle Enter while still on title screen
    const title = document.getElementById("titleScreen");
    if (!title || !title.classList.contains("is-active")) return;

    const hasSaveNow = refreshContinueVisibility();
    showGame(hasSaveNow);
  });
})();

// Handy in console:
window.getLegalIntents = getLegalIntents;
