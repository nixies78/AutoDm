/**
 * AutoDM — Adventure Generator
 * Orchestrates the multi-step Gemini pipeline to create a full adventure.
 */

class AdventureGenerator {
  constructor(api) {
    this.api        = api;
    this.onProgress = null;  // (stepsDone, stepsTotal, message) => void
  }

  /* ─── Main entry point ───────────────────────────────────────────────── */

  async generateTopology(config) {
    const { description, styles, numDoors, difficulty } = config;
    if (this.onProgress) this.onProgress(1, 1, 'Designing puzzle topology…');
    const outline = await this._generateTopologyOutline(config);
    
    // Assign spatial/locational groups (K-means++ style)
    this._assignLocationalGroups(outline.locations);

    const adventure = {
      id:           _uid(),
      title:        'Untitled Adventure',
      description:  '',
      introduction: '',
      goal:         outline.goal,
      winCondition: outline.winCondition,
      difficulty:   difficulty,
      styles:       styles,
      configDesc:   description,
      createdAt:    new Date().toISOString(),
      locations:    outline.locations,
      connections:  outline.connections || [],
      items:        outline.items       || [],
      characters:   outline.characters  || []
    };
    adventure.connections = this._repairConnections(adventure);
    return adventure;
  }

  _assignLocationalGroups(locations) {
    if (!locations || locations.length === 0) return;

    const K = (locations.length < 6) ? 2 : 3;

    for (const loc of locations) {
      let groupNum = 1;
      if (loc.x <= 0) {
        groupNum = 1;
      } else if (K === 2) {
        groupNum = 2;
      } else {
        groupNum = loc.y >= 0 ? 2 : 3;
      }
      loc.groupId = `group_${groupNum}`;
      loc.groupName = `Group ${groupNum}`;
    }
  }

  async generateGroupThemes(adventure) {
    if (this.onProgress) this.onProgress(1, 1, 'Conceptualizing distinct areas…');

    const groupIds = [...new Set(adventure.locations.map(l => l.groupId).filter(Boolean))].sort();

    const prompt =
`You are establishing a cohesive global setting and mission, and dividing the map into distinct sub-sections (zones) for a text adventure.

ADVENTURE CONCEPT: ${adventure.configDesc || 'A mystery or exploration adventure.'}
ADVENTURE STYLE:   ${adventure.styles.join(', ')}
NUMBER OF ZONES:   ${groupIds.length}

Please follow this exact two-step process:

1. ESTABLISH THE GLOBAL SETTING & MISSION:
Establish a single overarching cohesive setting (location) and a primary mission (goal).
- If the ADVENTURE CONCEPT is generic or blank, randomly generate an immersive setting and mission.
- Otherwise, base them on the concept.
Examples:
- Setting: "A ruined high school"
- Mission: "Locate the hidden emergency radio transmitter to call for rescue"
or
- Setting: "A deep space orbital station"
- Mission: "Evacuate the station before the hull fails"

2. GENERATE DISTINCT ZONES:
Divide the map into exactly ${groupIds.length} logical, distinct sub-sections (zones) that fit perfectly within the global setting.
Rule: All generated zones must logically belong to the exact same global setting, but you should make the physical environment of each zone as distinct and different from one another as possible while staying within that universe.
Vary the zones by environment types: indoor, outdoor, rooftop, underground, muddy caves, posh fortresses, maintenance areas, etc.
CRITICAL Rule: Keep the zone names and descriptions extremely simple, plain, and matter-of-fact. Avoid flowery adjectives, complex lore, or dramatic styling.

For each zone, generate:
- Name: A very simple, matter-of-fact title (e.g. 'The Castle', 'The Gardens', 'The Orchard', 'The Dungeon', 'The Tunnels', 'The Keep'). Do not make them overly fancy, complex, or poetic.
- Description: Exactly one very simple, matter-of-fact sentence explaining the environment in a direct way (e.g., 'An outdoor apple orchard that has become overgrown with thorns.', 'A stone-walled dungeon cellar used to hold prisoners.').

Respond with ONLY valid JSON matching this schema:
{
  "setting": "Overarching location description",
  "mission": "Primary goal / objective",
  "groups": {
    ${groupIds.map(gid => `"${gid}": {
      "name": "Simple Zone Name",
      "description": "One simple, direct sentence explaining the environment"
    }`).join(',\n    ')}
  }
}`;

    const raw = await this.api.generateText(prompt, null, true);
    const result = GeminiAPI.parseJSON(raw, 'Group themes');
    adventure.groups = result.groups || {};
    adventure.setting = result.setting || '';
    adventure.mission = result.mission || '';
    if (adventure.mission) {
      adventure.goal = adventure.mission;
    }
    return adventure;
  }

  async generateVerticality(adventure) {
    if (this.onProgress) this.onProgress(1, 1, 'Analyzing environmental verticality…');

    const prompt =
`You are analyzing the physical layout of a text adventure game to decide which areas should have vertical levels (up and down floors).

We have defined the following cohesive areas (groups of rooms) in the adventure:
${JSON.stringify(Object.entries(adventure.groups).map(([gid, g]) => ({ id: gid, name: g.name, description: g.description })))}

For each area, determine if its setting and description suggest it should be situated above, below, or span both relative to the main level:
- "up": if it is likely to go up (e.g. towers, rooftops, castle keep, tree canopy, etc.)
- "down": if it is likely to go down (e.g. dungeons, cellars, basements, caves, sewers, etc.)
- "both": if it can go both up and down (e.g. a tall tower with a deep cellar, a fortress with battlements and dungeons, etc.)
- "none": if it is flat ground with no obvious vertical elements.

Respond with ONLY valid JSON:
{
  "verticality": {
    "group_1": "up|down|both|none",
    "group_2": "up|down|both|none",
    "group_3": "up|down|both|none"
  }
}`;

    const raw = await this.api.generateText(prompt, null, true);
    const result = GeminiAPI.parseJSON(raw, 'Area verticality');
    const vert = result.verticality || {};
    
    adventure.verticality = vert;
    
    // Set z coordinate for all existing rooms
    for (const loc of adventure.locations) {
      loc.z = 0;
      const v = vert[loc.groupId];
      if (v === 'up') loc.z = 1;
      if (v === 'down') loc.z = -1;
      // 'both' groups start at z = 0, with vertical exits going both up and down
    }
    
    // Select a room in each vertical group to connect a new vertical room
    let nextId = 100;
    for (const [groupId, v] of Object.entries(vert)) {
      if (v !== 'up' && v !== 'down' && v !== 'both') continue;
      
      const groupRooms = adventure.locations.filter(l => l.groupId === groupId);
      if (groupRooms.length === 0) continue;
      
      const dirsToCreate = [];
      if (v === 'up' || v === 'both') dirsToCreate.push('up');
      if (v === 'down' || v === 'both') dirsToCreate.push('down');

      for (const dir of dirsToCreate) {
        // Find a source room in this group that could connect verticality (avoid starting/exit if possible)
        let sourceRoom = groupRooms.find(r => r.role !== 'starting' && r.role !== 'exit' && !r.exits.up && !r.exits.down);
        if (!sourceRoom) sourceRoom = groupRooms.find(r => r.role !== 'starting' && r.role !== 'exit');
        if (!sourceRoom) sourceRoom = groupRooms[0];
        
        const newZ = sourceRoom.z + (dir === 'up' ? 1 : -1);
        const newLocId = `loc_v_${nextId++}`;
        const oppDir = (dir === 'up') ? 'down' : 'up';
        
        const newRoom = {
          id: newLocId,
          x: sourceRoom.x,
          y: sourceRoom.y + (dir === 'up' ? -1 : 1),
          z: newZ,
          role: 'exploration',
          items: [],
          characters: [],
          exits: {},
          lockedExits: {},
          hiddenExits: {},
          name: dir === 'up' ? 'Upper Level Chamber' : 'Deep Cave Chamber',
          groupId: sourceRoom.groupId,
          groupName: sourceRoom.groupName
        };
        
        sourceRoom.exits[dir] = newLocId;
        newRoom.exits[oppDir] = sourceRoom.id;
        
        adventure.locations.push(newRoom);
        adventure.connections.push({
          from: sourceRoom.id,
          to: newLocId,
          direction: dir,
          reverseDirection: oppDir,
          type: 'open'
        });
      }
    }
    
    // Update all existing cross-floor connection exit labels
    for (const conn of adventure.connections) {
      const locA = adventure.locations.find(l => l.id === conn.from);
      const locB = adventure.locations.find(l => l.id === conn.to);
      if (!locA || !locB) continue;
      
      if (locA.z !== locB.z) {
        const oldDir = conn.direction;
        const oldOppDir = conn.reverseDirection;
        
        const newDir = locA.z < locB.z ? 'up' : 'down';
        const newOppDir = locA.z < locB.z ? 'down' : 'up';
        
        conn.direction = newDir;
        conn.reverseDirection = newOppDir;
        
        const updateExits = (loc, targetId, oldD, newD) => {
          if (loc.exits[oldD] === targetId) {
            delete loc.exits[oldD];
            loc.exits[newD] = targetId;
          }
          if (loc.lockedExits[oldD]) {
            loc.lockedExits[newD] = loc.lockedExits[oldD];
            delete loc.lockedExits[oldD];
          }
          if (loc.hiddenExits[oldD]) {
            loc.hiddenExits[newD] = loc.hiddenExits[oldD];
            delete loc.hiddenExits[oldD];
          }
        };
        
        updateExits(locA, locB.id, oldDir, newDir);
        updateExits(locB, locA.id, oldOppDir, newOppDir);
      }
    }
    
    adventure.connections = this._repairConnections(adventure);
    return adventure;
  }

  async generateFlavor(adventure) {
    if (this.onProgress) this.onProgress(1, 1, 'Adding thematic flavor…');
    const flavor = await this._generateFlavorOutline(adventure);
    
    adventure.title = flavor.title || 'Untitled Adventure';
    adventure.description = flavor.description || '';
    adventure.introduction = flavor.introduction || '';
    
    // Merge flavor into locations
    for (const loc of adventure.locations) {
       const fLoc = (flavor.locations || []).find(l => l.id === loc.id);
       if (fLoc) {
         loc.name = fLoc.name || loc.name;
         loc.shortDescription = fLoc.shortDescription || '';
         loc.imagePrompt = fLoc.imagePrompt || '';
       }
    }
    
    // Merge flavor into items
    for (const item of adventure.items) {
       const fItem = (flavor.items || []).find(i => i.id === item.id);
       if (fItem) {
         item.name = fItem.name || item.name;
         item.description = fItem.description || '';
         item.imagePrompt = fItem.imagePrompt || '';
         item.useDescription = fItem.useDescription || '';
       }
    }
    
    // Merge flavor into characters
    for (const char of adventure.characters) {
       const fChar = (flavor.characters || []).find(c => c.id === char.id);
       if (fChar) {
         char.name = fChar.name || char.name;
         char.description = fChar.description || '';
         char.personality = fChar.personality || '';
         char.dialogue = fChar.dialogue || '';
       }
    }
    
    return adventure;
  }

  async generateDetails(adventure) {
    let step = 0;
    const total = adventure.locations.length;
    const progress = (msg) => { if (this.onProgress) this.onProgress(++step, total, msg); };

    const detailedLocations = [];
    for (const loc of adventure.locations) {
      progress(`Detailing: ${loc.name}…`);
      const detailed = await this._detailLocation(adventure, loc, adventure.styles);
      detailedLocations.push(detailed);
    }
    adventure.locations = detailedLocations;
    return adventure;
  }

  async generateImages(adventure) {
    let step = 0;
    const total = adventure.locations.length + (adventure.items || []).length;
    const progress = (msg) => { if (this.onProgress) this.onProgress(++step, total, msg); };

    for (const loc of adventure.locations) {
      progress(`Painting: ${loc.name}…`);
      const styleStr = adventure.styles.join(', ');
      const sceneDesc = loc.imagePrompt || loc.shortDescription || loc.name;
      const areaTheme = adventure.groups && adventure.groups[loc.groupId]
        ? `Area: ${adventure.groups[loc.groupId].name} (${adventure.groups[loc.groupId].description}). `
        : '';
      const imgPrompt =
        `16:9 landscape environment concept art for a video game. ` +
        `You are looking INTO the location from inside it — a full wide-angle room/area view. ` +
        `${areaTheme}` +
        `Location: ${loc.name}. ` +
        `Visual scene: ${sceneDesc}. ` +
        `Art style: ${styleStr} — cinematic, atmospheric, painterly, dramatic lighting, rich detail. ` +
        `The image must show: walls, floor, ceiling or sky, the full depth of the space receding into the background, environmental details. ` +
        `Camera angle: wide establishing shot, roughly eye-level, looking across the whole space. ` +
        `Mood: immersive, moody, game-ready environment art. ` +
        `ABSOLUTELY NO: single isolated objects, door icons, logos, symbols, badges, UI, text, watermarks, ` +
        `white backgrounds, simple illustrations, clip art, emoji, cartoon icons, close-up object photos.`;
      loc.image = await this.api.generateImage(imgPrompt);
    }

    for (const item of (adventure.items || [])) {
      progress(`Crafting item: ${item.name}…`);
      const imgPrompt = 
        `A single object on a pure black background. ` +
        `Object: ${item.name}. ` +
        `Description: ${item.imagePrompt || item.description}. ` +
        `Art style: high quality game asset, detailed, centered, dramatic lighting. ` +
        `ABSOLUTELY NO: UI, text, watermarks, other objects, complex backgrounds.`;
      item.image = await this.api.generateImage(imgPrompt);
    }

    if (this.onProgress) this.onProgress(total, total, 'Done!');
    return adventure;
  }

  /* ─── Step 1: World outline ──────────────────────────────────────────── */

  async _generateTopologyOutline(config) {
    const { numDoors } = config;

    const grid = new Map();
    const locations = [];
    const connections = [];
    const items = [];
    const characters = [];

    const dirs = [
      { dx: 0, dy: -1, name: 'north', opp: 'south' },
      { dx: 0, dy: 1,  name: 'south', opp: 'north' },
      { dx: 1, dy: 0,  name: 'east',  opp: 'west'  },
      { dx: -1, dy: 0, name: 'west',  opp: 'east'  }
    ];

    let nextId = 1;
    const addLoc = (x, y, role = 'exploration') => {
      const id = `loc_${nextId++}`;
      const loc = {
        id, x, y, role,
        items: [], characters: [],
        exits: {}, lockedExits: {}, hiddenExits: {},
        name: `Room ${nextId - 1}`
      };
      grid.set(`${x},${y}`, loc);
      locations.push(loc);
      return loc;
    };

    const connect = (from, to, dir, revDir, extra = {}) => {
      from.exits[dir] = to.id;
      to.exits[revDir] = from.id;
      connections.push({ from: from.id, to: to.id, direction: dir, reverseDirection: revDir, ...extra });
    };

    // Helper to get accessible rooms up to a certain unlocked door index
    const getAccessibleRoomsUpTo = (maxUnlockedLockIndex) => {
      const acc = new Set([start.id]);
      const q = [start.id];
      while (q.length > 0) {
        const cur = q.shift();
        for (const c of connections) {
          if (c.type === 'locked' && c.lockIndex > maxUnlockedLockIndex) {
            continue;
          }
          const nId = (c.from === cur) ? c.to : (c.to === cur ? c.from : null);
          if (nId && !acc.has(nId)) {
            acc.add(nId);
            q.push(nId);
          }
        }
      }
      return acc;
    };

    // Helper to select a room applying weighted logic to prevent clustering
    const selectWeightedRoom = (candidatesPool) => {
      if (!candidatesPool || candidatesPool.length === 0) return null;
      
      const weights = candidatesPool.map(loc => {
        const keyCount = loc.items.filter(itemId => itemId.startsWith('item_key_')).length;
        if (keyCount === 0) return 1.0;
        if (keyCount === 1) return 0.1;
        if (keyCount === 2) return 0.01;
        return 0.001;
      });

      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let r = Math.random() * totalWeight;
      for (let i = 0; i < candidatesPool.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          return candidatesPool[i];
        }
      }
      return candidatesPool[candidatesPool.length - 1];
    };

    const K = (numDoors >= 2) ? 3 : 2;

    const getGroupForCoord = (x, y, KVal) => {
      if (x <= 0) return 1;
      if (KVal === 2) return 2;
      return y >= 0 ? 2 : 3;
    };

    // ── Free adjacent slots for a room set within target groups
    const getFreeAdjacentSlots = (roomSet, targetGroups) => {
      const slots = [];
      for (const loc of locations) {
        if (!roomSet.has(loc.id)) continue;
        for (const d of dirs) {
          const nx = loc.x + d.dx;
          const ny = loc.y + d.dy;
          if (!grid.has(`${nx},${ny}`)) {
            if (targetGroups.includes(getGroupForCoord(nx, ny, K))) {
              if (!slots.some(s => s.nx === nx && s.ny === ny)) {
                slots.push({ from: loc, nx, ny, dir: d.name, revDir: d.opp });
              }
            }
          }
        }
      }
      return slots;
    };

    // ── 1. Initialization ───────────────────────────────────
    const start = addLoc(0, 0, 'starting');
    const doorPasts = [];   // doorPasts[i] = room id just past Door (i+1)

    // ── 2. Generation Loop ──────────────────────────────────
    for (let lockIndex = 1; lockIndex <= numDoors; lockIndex++) {
      const currentZoneIdx = lockIndex - 1;
      // Zone 0 is strictly Group 1 (left side). Subsequent zones expand into Groups 2 & 3 (right side).
      const allowedGroups = (currentZoneIdx === 0) ? [1] : (K === 3 ? [2, 3] : [2]);

      // Seed node for the new zone branch
      const zoneSeedId = (lockIndex === 1) ? start.id : doorPasts[lockIndex - 2];
      const zoneNodes = new Set([zoneSeedId]);

      // Force building a branch of 2 to 4 rooms within allowedGroups
      const expandCount = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4 rooms
      const expandedThisLoop = [];

      for (let e = 0; e < expandCount; e++) {
        const slots = getFreeAdjacentSlots(zoneNodes, allowedGroups);
        if (slots.length === 0) break;
        const slot = slots[Math.floor(Math.random() * slots.length)];
        const node = addLoc(slot.nx, slot.ny);
        connect(slot.from, node, slot.dir, slot.revDir);
        expandedThisLoop.push(node);
        zoneNodes.add(node.id);
      }

      // Step B: Place primary Key [lockIndex] in the new branch
      const stateKey = `door_open_${lockIndex}`;
      let primaryCandidates = expandedThisLoop.length > 0
        ? expandedThisLoop
        : [locations.find(l => l.id === zoneSeedId)];

      const primaryRoom = selectWeightedRoom(primaryCandidates);
      if (primaryRoom) {
        items.push({
          id: `item_key_${lockIndex}_part1`,
          name: `Key ${lockIndex}.1`,
          takeable: true, usable: true, resolvesState: stateKey, keyItem: true
        });
        primaryRoom.items.push(`item_key_${lockIndex}_part1`);
      }

      // Step C: 50% chance — second key part (Additional Key) anywhere in currently accessible map
      if (Math.random() < 0.5) {
        const accessibleNow = getAccessibleRoomsUpTo(lockIndex - 1);
        const candidates = locations.filter(l => accessibleNow.has(l.id));
        const secondRoom = selectWeightedRoom(candidates);
        if (secondRoom) {
          items.push({
            id: `item_key_${lockIndex}_part2`,
            name: `Key ${lockIndex}.2`,
            takeable: true, usable: true, resolvesState: stateKey, keyItem: true
          });
          secondRoom.items.push(`item_key_${lockIndex}_part2`);
        }
      }

      // Step D: Create locked door leading into the NEXT zone
      const nextAllowedGroups = (K === 3) ? [2, 3] : [2];
      const accessibleNow = getAccessibleRoomsUpTo(lockIndex - 1);
      const slots = getFreeAdjacentSlots(accessibleNow, nextAllowedGroups);
      if (slots.length > 0) {
        const slot = slots[Math.floor(Math.random() * slots.length)];
        const roomBeyond = addLoc(slot.nx, slot.ny);
        doorPasts.push(roomBeyond.id);

        const fromNode = slot.from;
        connect(fromNode, roomBeyond, slot.dir, slot.revDir, { type: 'locked', lockIndex, stateKey });
        delete fromNode.exits[slot.dir];
        delete roomBeyond.exits[slot.revDir];
        fromNode.lockedExits[slot.dir] = { stateKey, stateValue: true };
        roomBeyond.lockedExits[slot.revDir] = { stateKey, stateValue: true };
      } else {
        break;
      }
    }

    // ── 3. Set exit: exactly the room immediately past the last locked door
    let exitNode = null;
    if (doorPasts.length > 0) {
      exitNode = locations.find(l => l.id === doorPasts[doorPasts.length - 1]);
    }

    // Fallback if no exitNode found or doorPasts is empty
    if (!exitNode && locations.length > 0) {
      // Find the room furthest from start (using a simple BFS from start)
      const bfsDist = new Map();
      const q = [start.id];
      bfsDist.set(start.id, 0);
      while (q.length > 0) {
        const cur = q.shift();
        const curDist = bfsDist.get(cur);
        for (const c of connections) {
          const nId = (c.from === cur) ? c.to : (c.to === cur ? c.from : null);
          if (nId && !bfsDist.has(nId)) {
            bfsDist.set(nId, curDist + 1);
            q.push(nId);
          }
        }
      }
      
      let maxDist = -1;
      for (const loc of locations) {
        if (loc.role !== 'starting') {
          const dist = bfsDist.get(loc.id) || 0;
          if (dist > maxDist) {
            maxDist = dist;
            exitNode = loc;
          }
        }
      }
    }

    if (!exitNode) {
      exitNode = start;
    }

    exitNode.role = 'exit';

    /* ─── Flavor items & characters ────────────────────────────────────── */

    const numFlavorItems = Math.max(2, Math.floor(locations.length / 2));
    for (let i = 0; i < numFlavorItems; i++) {
      const id = `item_flavor_${i}`;
      items.push({ id, name: `Item ${i + 1}`, takeable: true, usable: false, resolvesState: null, keyItem: false });
      locations[Math.floor(Math.random() * locations.length)].items.push(id);
    }

    const numChars = Math.max(1, Math.floor(locations.length / 3));
    for (let i = 0; i < numChars; i++) {
      const id = `char_${i}`;
      characters.push({ id, name: `Character ${i + 1}`, givesItem: null });
      locations[Math.floor(Math.random() * locations.length)].characters.push(id);
    }

    /* ─── 9. Assign roles ─────────────────────────────────────────────────── */

    const roles = ['puzzle', 'treasure', 'boss'];
    for (const loc of locations) {
      if (loc.role === 'exploration') {
        loc.role = roles[Math.floor(Math.random() * roles.length)];
      }
    }

    /* ─── Win condition ──────────────────────────────────────────────────── */

    const winCondition = {
      type: 'reach_location',
      locationId: exitNode.id,
      itemId: null,
      stateKey: null,
      stateValue: null
    };

    /* ─── Return ─────────────────────────────────────────────────────────── */

    return {
      goal: 'Explore branching paths, collect key fragments, unlock doors, and reach the exit.',
      winCondition,
      locations: locations.map(l => ({ ...l })),
      connections,
      items,
      characters
    };
  }

  async _generateFlavorOutline(adventure) {
    const prompt =
`You are adding rich thematic flavor to a generic text adventure topology.

CONCEPT: ${adventure.configDesc}
STYLE:   ${adventure.styles.join(', ')}

LOCATIONAL GROUPS (AREAS):
${JSON.stringify(adventure.groups)}

Here is the generic puzzle structure:
${JSON.stringify({
  locations: adventure.locations.map(l => ({id: l.id, role: l.role, groupId: l.groupId})),
  items: adventure.items.map(i => ({id: i.id})),
  characters: adventure.characters.map(c => ({id: c.id}))
})}

For every ID listed above, invent a rich, thematic name and description that perfectly matches the STYLE, CONCEPT, and their LOCATIONAL GROUP (if applicable).
For instance, rooms in each group must be themed exactly according to their area:
${Object.entries(adventure.groups || {}).map(([gid, grp]) => `- Rooms in "${gid}" belong to the area "${grp.name}" (${grp.description})`).join('\n')}

Respond with ONLY valid JSON matching this schema:
{
  "title": "string",
  "description": "one-line teaser",
  "introduction": "two paragraph atmospheric introduction shown at game start",
  "locations": [
    {
      "id": "loc_001",
      "name": "Thematic Name (e.g. The Abyssal Chasm)",
      "shortDescription": "one-sentence description",
      "imagePrompt": "Describe this location as a SCENE for an AI image generator. Describe what you would SEE if standing inside it: the physical space, surfaces, lighting, colours, atmosphere, architecture. E.g. 'A vast stone throne room lit by torches, cracked marble floor, arched ceilings lost in shadow, green mist drifting from floor grates'. Do NOT mention icons, symbols, game UI, or describe objects in isolation."
    }
  ],
  "items": [
    {
      "id": "item_001",
      "name": "Thematic Name (e.g. Obsidian Dagger)",
      "description": "what it looks like / feels like",
      "useDescription": "what happens when used",
      "imagePrompt": "Describe this item as a single object centered on a solid black background. E.g. 'A glowing blue potion flask on a pure black background'. No text, no other objects."
    }
  ],
  "characters": [
    {
      "id": "char_001",
      "name": "Thematic Name",
      "description": "appearance",
      "personality": "one-sentence personality",
      "dialogue": "first thing they say when greeted"
    }
  ]
}`;

    const raw = await this.api.generateText(prompt, null, true);
    return GeminiAPI.parseJSON(raw, 'Flavor outline');
  }

  /* ─── Step 2: Location detail ────────────────────────────────────────── */

  async _detailLocation(outline, loc, styles) {
    const areaTheme = outline.groups && outline.groups[loc.groupId]
      ? `Area: ${outline.groups[loc.groupId].name} (${outline.groups[loc.groupId].description})`
      : 'N/A';
    const prompt =
`You are writing content for one location in a text adventure.

Adventure: "${outline.title}"  |  Style: ${styles.join(', ')}
Goal: ${outline.goal}

LOCATION TO DETAIL:
  Name: ${loc.name}  (id: ${loc.id}, role: ${loc.role})
  Area: ${areaTheme}
  Short description: ${loc.shortDescription}
  Items here: ${(loc.items || []).join(', ') || 'none'}
  Characters: ${(loc.characters || []).join(', ') || 'none'}
  Exits: ${JSON.stringify(loc.exits || {})}

Write a highly concise, evocative description of MAXIMUM 30 words that naturally mentions any items and characters present.
DO NOT include or mention the overall adventure goal or objective in these descriptions.
Also write 2-3 alternative "state descriptions" — alternate versions shown AFTER specific events
(e.g., after a fire is extinguished, after a door is unlocked). Each alternative description must also be MAXIMUM 30 words.

Respond with ONLY valid JSON:
{
  "fullDescription": "evocative description (max 30 words)",
  "stateDescriptions": {
    "descriptive_snake_case_key": "alternate description after that state (max 30 words)"
  }
}`;

    try {
      const raw     = await this.api.generateText(prompt, null, true);
      const details = GeminiAPI.parseJSON(raw, `Location detail: ${loc.name}`);
      return {
        ...loc,
        fullDescription:   details.fullDescription || loc.shortDescription,
        stateDescriptions: details.stateDescriptions || {}
      };
    } catch (err) {
      console.warn('Location detail failed for', loc.name, err.message);
      return { ...loc, fullDescription: loc.shortDescription, stateDescriptions: {} };
    }
  }

  /* ─── Helpers ────────────────────────────────────────────────────────── */

  _repairConnections(adventure) {
    const locationIds = new Set(adventure.locations.map(l => l.id));
    const conns       = (adventure.connections || []).filter(c =>
      locationIds.has(c.from) && locationIds.has(c.to)
    );

    // Ensure exits in location objects match connections
    for (const loc of adventure.locations) {
      for (const [dir, destId] of Object.entries(loc.exits || {})) {
        if (!locationIds.has(destId)) {
          delete loc.exits[dir];
          continue;
        }
        let type = 'open';
        if (loc.lockedExits && loc.lockedExits[dir]) type = 'locked';
        if (loc.hiddenExits && loc.hiddenExits[dir]) type = 'hidden';

        const exists = conns.some(c => c.from === loc.id && c.direction === dir);
        if (!exists) {
          const reverseDir = _reverseDirection(dir);
          conns.push({ from: loc.id, to: destId, direction: dir, reverseDirection: reverseDir, type });
        } else {
          // Update type if it already exists
          const c = conns.find(c => c.from === loc.id && c.direction === dir);
          if (c) c.type = type;
        }
      }
    }
    return conns;
  }
}

/* ─── Utility functions ─────────────────────────────────────────────────── */

function _uid() {
  return 'adv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function _reverseDirection(dir) {
  const map = {
    north: 'south', south: 'north',
    east:  'west',  west:  'east',
    up:    'down',  down:  'up',
    in:    'out',   out:   'in'
  };
  return map[dir] || 'back';
}
