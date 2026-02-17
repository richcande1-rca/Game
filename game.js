/* Gothic Chronicle — deterministic engine + dynamic choice text.
   Save: localStorage key "gothicChronicle.save.v1"
*/

const SAVE_KEY = "gothicChronicle.save.v1";

/* ---------------------------
   WORLD DATA (deterministic)
---------------------------- */
const WORLD = {
  rooms: {
    gate: {
      name: "Iron Gate",
      descSeed: "A rusted iron gate stands between you and the estate. Fog coils like breath in winter.",
      exits: { north: { to: "courtyard", requiresFlag: "gate_unlocked" }, east: { to: "wallpath" } },
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
      exits: { south: { to: "wallpath" }, north: { to: "kitchen" , requiresFlag: "service_unlocked"} },
      items: [],
      tags: ["wood", "lock"],
      lock: { flagToSet: "service_unlocked", keyItem: "brass_key" }
    },
    courtyard: {
      name: "Courtyard",
      descSeed: "Moonlight spills into a courtyard of broken statues. A fountain lies cracked, the water black and still.",
      exits: { south: { to: "gate" }, north: { to: "foyer" } },
      items: ["brass_key"],
      tags: ["outdoors", "moonlight", "statues"],
      firstVisitMilestone: "m_courtyard_first"
    },
    kitchen: {
      name: "Kitchen",
      descSeed: "Cold hearth. Hanging hooks. The smell of iron and old herbs. Someone has been here recently—barely.",
      exits: { south: { to: "servicedoor" } },
      items: ["matchbook"],
      tags: ["indoors", "hearth", "stale"]
    },
    foyer: {
      name: "Foyer",
      descSeed: "A grand foyer stripped of warmth. Portraits stare with eyes too certain. The staircase ascends into shadow.",
      exits: { south: { to: "courtyard" }, east: { to: "library", requiresFlag: "candle_lit" } },
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
      examine: "A brass key, warm despite the air."
    },
    matchbook: {
      name: "Matchbook",
      examine: "A cheap matchbook with a faded crest."
    },
    candle: {
      name: "Candle",
      examine: "A pale candle. Unlit."
    },
    silver_seal: {
      name: "Silver Seal",
      examine: "A cold silver seal engraved with a crescent and thorned rose."
    }
  }
};

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

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(STATE));
}

function room() {
  return WORLD.rooms[STATE.roomId];
}

function addChron(entry) {
  STATE.chronicle.push(entry);
}

function getLegalIntents() {
  const r = room();
  const intents = [];

  for (const [dir, ex] of Object.entries(r.exits || {})) {
    if (ex.requiresFlag && !STATE.flags[ex.requiresFlag]) continue;
    intents.push({ id: `MOVE_${dir}`, type: "move", dir, to: ex.to });
  }

  for (const it of (r.items || [])) {
    intents.push({ id: `TAKE_${it}`, type: "take", itemId: it });
  }

  intents.push({ id: "INVENTORY", type: "inventory" });
  intents.push({ id: "WAIT", type: "wait" });

  return intents;
}

function narrateScene() {
  return room().descSeed;
}

function prettyChoice(intent) {
  if (intent.type === "move") {
    return `Go ${intent.dir} toward ${WORLD.rooms[intent.to].name}.`;
  }
  if (intent.type === "take") {
    return `Take the ${WORLD.items[intent.itemId].name}.`;
  }
  if (intent.type === "inventory") return "Check inventory.";
  if (intent.type === "wait") return "Wait and listen.";
  return intent.id;
}

function applyIntent(intent) {
  STATE.turn++;

  if (intent.type === "move") {
    STATE.roomId = intent.to;
  }

  if (intent.type === "take") {
    const r = room();
    r.items = r.items.filter(x => x !== intent.itemId);
    STATE.inventory.push(intent.itemId);
  }

  saveState();
  render();
}

function render() {
  const sceneEl = document.getElementById("scene");
  const choicesEl = document.getElementById("choices");

  sceneEl.textContent = narrateScene();

  choicesEl.innerHTML = "";

  const intents = getLegalIntents();

  intents.forEach((intent, i) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = `${i+1}) ${prettyChoice(intent)}`;
    btn.onclick = () => applyIntent(intent);
    choicesEl.appendChild(btn);
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "9") {
    const intents = getLegalIntents();
    const i = parseInt(e.key)-1;
    if (intents[i]) applyIntent(intents[i]);
  }
});

render();
