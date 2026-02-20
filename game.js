/* Gothic Chronicle — deterministic engine + overlays + images
   - Deterministic world: rooms/items/flags are truth
   - Overlay layer:
        * AUTO overlay (default): generates gothic narration + choice text every render
        * Manual GPT overlay button: paste JSON to override (one turn only)
   - Images:
        * Loads from Cloudflare Worker endpoint (keeps API keys secret)
   - Save: localStorage
*/

const SAVE_KEY = "gothicChronicle.save.v1";
const OVERLAY_KEY = "gothicChronicle.overlay.v1";

// ====== CONFIG ======
const AUTO_NARRATOR = true;
const AUTO_IMAGES = true;

const CF_IMAGE_BASE =
  "https://gothic-chronicle-images.rich-gothic.workers.dev/image";

/* ---------------------------
   WORLD DATA (deterministic)
---------------------------- */
const WORLD = {
  rooms: {
    gate: {
      name: "Iron Gate",
      descSeed:
        "A rusted iron gate stands between you and the estate. Fog coils like breath in winter.",
      exits: {
        north: { to: "courtyard", requiresFlag: "gate_unlocked" },
        east: { to: "wallpath" },
      },
      items: ["old_note"],
      tags: ["outdoors", "fog", "threshold"],
      firstVisitMilestone: "m_gate_first",
    },

    wallpath: {
      name: "Outer Wall Path",
      descSeed:
        "You follow stonework slick with damp. The wall rises like a mute witness.",
      exits: { west: { to: "gate" }, north: { to: "servicedoor" } },
      items: [],
      tags: ["outdoors", "stone", "quiet"],
    },

    servicedoor: {
      name: "Service Door",
      descSeed:
        "A narrow door with a stubborn lock. Scratches mark the wood as if something begged to be let in—or out.",
      exits: {
        south: { to: "wallpath" },
        north: { to: "kitchen", requiresFlag: "service_unlocked" },
      },
      items: [],
      tags: ["wood", "lock"],
      lock: { flagToSet: "service_unlocked", keyItem: "brass_key" },
    },

    kitchen: {
      name: "Kitchen",
      descSeed:
        "Cold hearth. Hanging hooks. The smell of iron and old herbs. Someone has been here recently—barely.",
      exits: { south: { to: "servicedoor" } },
      items: ["matchbook"],
      tags: ["indoors", "hearth", "stale"],
    },

    courtyard: {
      name: "Courtyard",
      descSeed:
        "Moonlight spills into a courtyard of broken statues. A fountain lies cracked, the water black and still.",
      exits: { south: { to: "gate" }, north: { to: "foyer" } },
      items: ["brass_key"],
      tags: ["outdoors", "moonlight", "statues"],
      firstVisitMilestone: "m_courtyard_first",
    },

    foyer: {
      name: "Foyer",
      descSeed:
        "A grand foyer stripped of warmth. Portraits stare with eyes too certain. The staircase ascends into shadow.",
      exits: {
        south: { to: "courtyard" },
        east: { to: "library", requiresFlag: "candle_lit" },
      },
      items: ["candle"],
      tags: ["indoors", "portraits", "echo"],
      firstVisitMilestone: "m_foyer_first",
    },

    library: {
      name: "Library",
      descSeed:
        "Books like tombstones. Dust thick as velvet. In the corner, a lectern waits like an accusation.",
      exits: {
        west: { to: "foyer" },
        north: { to: "sealedpassage", requiresFlag: "seal_placed" },
      },
      items: ["silver_seal"],
      tags: ["indoors", "books", "secrets"],
      firstVisitMilestone: "m_library_first",
    },

    sealedpassage: {
      name: "Sealed Passage",
      descSeed:
        "Behind the lectern, stone slides with a sigh. A passage breathes out dust that tastes like old prayers.",
      exits: { south: { to: "library" }, north: { to: "chapel" } },
      items: ["diary_page"],
      tags: ["indoors", "stone", "secrets"],
      firstVisitMilestone: "m_sealedpassage_first",
    },

    chapel: {
      name: "Chapel",
      descSeed:
        "A private chapel, abandoned but not empty. Candles have melted into grotesque stalagmites. The altar is stained dark.",
      exits: {
        south: { to: "sealedpassage" },
        east: { to: "gallery" },
        down: { to: "crypt", requiresFlag: "crypt_unlocked" },
      },
      items: ["rosary"],
      tags: ["indoors", "faith", "cold"],
      lock: { flagToSet: "crypt_unlocked", keyItem: "iron_key" },
      firstVisitMilestone: "m_chapel_first",
    },

    gallery: {
      name: "Gallery",
      descSeed:
        "Frames line the walls like windows into lives that never ended. One portrait’s eyes appear newly wet.",
      exits: { west: { to: "chapel" }, north: { to: "upperlanding" } },
      items: ["raven_feather"],
      tags: ["indoors", "portraits", "echo"],
      firstVisitMilestone: "m_gallery_first",
    },

    upperlanding: {
      name: "Upper Landing",
      descSeed:
        "The upper landing creaks like a held breath. Doors wait on both sides, polite as teeth.",
      exits: {
        south: { to: "gallery" },
        east: { to: "masterbed" },
        west: { to: "nursery" },
      },
      items: [],
      tags: ["indoors", "shadow", "quiet"],
      firstVisitMilestone: "m_upperlanding_first",
    },

    masterbed: {
      name: "Master Bedroom",
      descSeed:
        "A vast bed draped in ruined finery. The canopy hangs like mourning cloth. The mirror here refuses to feel honest.",
      exits: { west: { to: "upperlanding" } },
      items: ["iron_key"],
      tags: ["indoors", "silk", "wrong"],
      firstVisitMilestone: "m_masterbed_first",
    },

    nursery: {
      name: "Nursery",
      descSeed:
        "A nursery with a cradle that rocks in its own time. Toys sit arranged as if expecting applause.",
      exits: { east: { to: "upperlanding" }, down: { to: "foyer" } },
      items: ["music_box"],
      tags: ["indoors", "childhood", "stillness"],
      firstVisitMilestone: "m_nursery_first",
    },

    crypt: {
      name: "Crypt",
      descSeed:
        "Stone steps descend into a crypt where names have been scratched out. The air is colder than truth.",
      exits: { up: { to: "chapel" }, north: { to: "cellar" } },
      items: ["vial_ash"],
      tags: ["indoors", "stone", "dead"],
      firstVisitMilestone: "m_crypt_first",
    },

    cellar: {
      name: "Cellar",
      descSeed:
        "Casks rot in rows. The floor is damp, the walls sweating. A distant drip keeps time like a metronome for dread.",
      exits: { south: { to: "crypt" }, west: { to: "kitchen" } },
      items: ["cold_coins"],
      tags: ["indoors", "damp", "dark"],
      firstVisitMilestone: "m_cellar_first",
    },
  },

  items: {
    old_note: {
      name: "Old Note",
      examine:
        "The ink has bled, but one line remains: “Do not enter unlit. The house favors the unseen.”",
    },

    brass_key: {
      name: "Brass Key",
      examine:
        "A brass key, warm despite the air. The teeth are worn as if often turned in fear.",
    },

    matchbook: {
      name: "Matchbook",
      examine:
        "A cheap matchbook. The cover bears a faded crest—three ravens and a crown.",
    },

    candle: {
      name: "Candle",
      examine: "A pale candle. Unlit. The wick looks strangely new.",
    },

    silver_seal: {
      name: "Silver Seal",
      examine:
        "A cold silver seal engraved with a crescent and thorned rose. It feels like a boundary.",
    },

    diary_page: {
      name: "Diary Page",
      examine:
        "A torn page, the handwriting tight with panic: “The seal is not a relic—it's a promise. Place it where words are weighed. Do not pray for mercy. Bargain for boundaries.”",
    },

    rosary: {
      name: "Rosary",
      examine:
        "Wooden beads darkened by touch. One bead is carved into a tiny thorned rose. It feels warm, as if recently held.",
    },

    raven_feather: {
      name: "Raven Feather",
      examine:
        "A glossy black feather. It catches the light like oil on water. When you hold it, you can almost hear wings in the walls.",
    },

    iron_key: {
      name: "Iron Key",
      examine:
        "A heavy iron key, pitted with age. It smells faintly of candle smoke and soil.",
    },

    music_box: {
      name: "Music Box",
      examine:
        "A small music box shaped like a coffin. The crank resists, then yields—playing a melody you somehow already know.",
    },

    vial_ash: {
      name: "Vial of Ash",
      examine:
        "A narrow glass vial filled with gray ash. The ash clings to the glass as if it hates falling.",
    },

    cold_coins: {
      name: "Cold Coins",
      examine:
        "A handful of old coins, too cold for the room. Their faces are worn smooth, as if rubbed by anxious thumbs for decades.",
    },
  },
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
let OVERLAY = loadOverlay();

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
  if (STATE.chronicle.length > 500) {
    STATE.chronicle.shift();
  }
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

  // Movement
  for (const [dir, ex] of Object.entries(r.exits || {})) {
    if (ex.requiresFlag && !hasFlag(ex.requiresFlag)) continue;
    intents.push({ id: `MOVE_${dir}`, type: "move", dir, to: ex.to });
  }

  // Take items
  for (const it of (r.items || [])) {
    intents.push({ id: `TAKE_${it}`, type: "take", itemId: it });
  }

  // Examine room items
  for (const it of (r.items || [])) {
    intents.push({
      id: `EXAMINE_${it}`,
      type: "examine",
      itemId: it,
      where: "room"
    });
  }

  // Examine inventory items
  for (const it of (STATE.inventory || [])) {
    intents.push({
      id: `EXAMINE_INV_${it}`,
      type: "examine",
      itemId: it,
      where: "inv"
    });
  }

  // Gate open
  if (STATE.roomId === "gate" && !hasFlag("gate_unlocked")) {
    intents.push({ id: "OPEN_gate", type: "misc", action: "open_gate" });
  }

  // Service door lock
  if (STATE.roomId === "servicedoor") {
    const lock = r.lock;
    if (lock && !hasFlag(lock.flagToSet)) {
      if (hasItem(lock.keyItem)) {
        intents.push({
          id: "UNLOCK_service",
          type: "unlock",
          flag: lock.flagToSet
        });
      } else {
        intents.push({
          id: "RATTLE_lock",
          type: "misc",
          action: "rattle_lock"
        });
      }
    }
  }

  // Chapel trapdoor lock
  if (STATE.roomId === "chapel") {
    const lock = r.lock;
    if (lock && !hasFlag(lock.flagToSet)) {
      if (hasItem(lock.keyItem)) {
        intents.push({
          id: "UNLOCK_crypt",
          type: "unlock",
          flag: lock.flagToSet
        });
      } else {
        intents.push({
          id: "KNEEL_altar",
          type: "misc",
          action: "kneel_altar"
        });
      }
    }
  }

  // Candle lighting
  const hasCandleVisibleOrHeld =
    (r.items || []).includes("candle") || hasItem("candle");

  if (
    hasItem("matchbook") &&
    hasCandleVisibleOrHeld &&
    !hasFlag("candle_lit")
  ) {
    intents.push({
      id: "LIGHT_candle",
      type: "use",
      action: "light_candle"
    });
  }

  // Seal placement
  if (
    STATE.roomId === "library" &&
    hasItem("silver_seal") &&
    !hasFlag("seal_placed")
  ) {
    intents.push({
      id: "PLACE_seal",
      type: "use",
      action: "place_seal"
    });
  }

  intents.push({ id: "INVENTORY", type: "inventory" });
  intents.push({ id: "WAIT", type: "wait" });

  return intents;
}
