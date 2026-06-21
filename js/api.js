/**
 * AutoDM — Gemini API Module
 * Wraps Google Generative Language REST API for text and image generation.
 * Supports all Google AI Studio key formats (AIza…, AQ.…, etc.)
 * All keys are passed as the ?key= query parameter — this is the correct
 * method for AI Studio API keys regardless of their prefix format.
 */

const GeminiAPI = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  /* ─── Helpers ───────────────────────────────────────────────────────── */

  function getKey()        { return Storage.getSetting('apiKey', '').trim(); }
  function getModel()      { return Storage.getSetting('model', 'gemini-3.5-flash'); }
  function getImageModel() {
    let m = Storage.getSetting('imageModel', 'gemini-3.1-flash-image');
    if (m === 'nano-banana-2') return 'gemini-3.1-flash-image';
    if (m === 'nano-banana-pro') return 'gemini-3-pro-image';
    return m;
  }

  function assertKey() {
    const k = getKey();
    if (!k) throw new Error('No API key set — open Settings to add your Google AI Studio key.');
  }

  async function postJSON(endpoint, body) {
    const key = getKey();
    // All Google AI Studio keys (any format) use the ?key= query parameter
    const url = `${endpoint}?key=${encodeURIComponent(key)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const d = await res.json();
        // Surface the exact API error message
        msg = d.error?.message || d.error?.status || msg;
      } catch {}
      throw new Error(msg);
    }

    return res.json();
  }

  /* ─── Mock Generator for Offline Testing ────────────────────────────── */

  function mockGenerateText(userPrompt, systemInstruction, jsonMode) {
    console.log('[MockAPI] generateText called with prompt:', userPrompt.slice(0, 150) + '...');
    
    if (userPrompt.trim() === 'Say the word OK.') {
      return 'OK';
    }
    
    let theme = 'castle';
    const conceptMatch = userPrompt.match(/ADVENTURE CONCEPT:\s*(.*)/i) || userPrompt.match(/CONCEPT:\s*(.*)/i);
    const concept = conceptMatch ? conceptMatch[1].toLowerCase() : '';
    if (concept.includes('space') || concept.includes('star') || concept.includes('ship') || concept.includes('sci-fi')) {
      theme = 'sci-fi';
    } else if (concept.includes('pirate') || concept.includes('sea') || concept.includes('ocean') || concept.includes('island')) {
      theme = 'pirate';
    }

    if (userPrompt.includes('spatial areas (groups of rooms)') || userPrompt.includes('groupIds') || userPrompt.includes('cohesive global setting')) {
      const groupMatches = [...userPrompt.matchAll(/(group_\d+)/g)].map(m => m[1]);
      const uniqueGroups = [...new Set(groupMatches)];
      if (uniqueGroups.length === 0) {
        uniqueGroups.push('group_1', 'group_2', 'group_3');
      }
      
      const themes = {
        'castle': {
          setting: 'An ancient medieval castle belonging to the evil King Keith.',
          mission: 'Defeat King Keith and escape the dungeon towers.',
          groups: {
            'group_1': { name: 'The Dungeon', desc: 'A stone-walled dungeon cellar used to hold prisoners.' },
            'group_2': { name: 'The Gardens', desc: 'An outdoor garden filled with stone paths and overgrown hedges.' },
            'group_3': { name: 'The Town', desc: 'A small medieval town located just outside the castle walls.' }
          }
        },
        'sci-fi': {
          setting: 'A derelict space research station decaying in orbit.',
          mission: 'Locate the secondary backup thrusters to prevent atmospheric reentry.',
          groups: {
            'group_1': { name: 'Crew Quarters', desc: 'An indoor residential area containing crew bunks and mess halls.' },
            'group_2': { name: 'The Core', desc: 'A central power room housing the main reactor.' },
            'group_3': { name: 'The Hangar', desc: 'A large docking bay used to park shuttlecraft.' }
          }
        },
        'pirate': {
          setting: 'A cursed volcanic island hidden in the Siren Sea.',
          mission: "Find the pieces of Captain Redbeard's compass to escape the island.",
          groups: {
            'group_1': { name: 'The Beach', desc: 'A sandy beach shore where ship debris washes up.' },
            'group_2': { name: 'The Grotto', desc: 'An underground cave filled with water pools.' },
            'group_3': { name: 'The Caves', desc: 'A dark cave network containing old mining tunnels.' }
          }
        }
      };

      const selectedTheme = themes[theme] || themes['castle'];
      const groups = {};
      for (const gid of uniqueGroups) {
        const item = (selectedTheme.groups && selectedTheme.groups[gid]) || { 
          name: `The Outskirts`, 
          desc: `Once a wild border outpost, now an uncharted boundary area surrounding the main sector.` 
        };
        groups[gid] = {
          name: item.name,
          description: item.desc
        };
      }

      return JSON.stringify({
        setting: selectedTheme.setting,
        mission: selectedTheme.mission,
        groups
      });
    }

    if (userPrompt.includes('Analyzing environmental verticality') || userPrompt.includes('verticality') || userPrompt.includes('up|down|both|none')) {
      const themes = {
        'castle': {
          'group_1': 'down',
          'group_2': 'both',
          'group_3': 'up'
        },
        'sci-fi': {
          'group_1': 'both',
          'group_2': 'down',
          'group_3': 'up'
        },
        'pirate': {
          'group_1': 'up',
          'group_2': 'none',
          'group_3': 'both'
        }
      };

      const selected = themes[theme] || themes['castle'];
      return JSON.stringify({
        verticality: selected
      });
    }

    if (userPrompt.includes('rich thematic flavor') || userPrompt.includes('LOCATIONAL GROUPS')) {
      const locationIds = [...userPrompt.matchAll(/"id":\s*"(loc_\d+)"/g)].map(m => m[1]);
      const itemIds = [...userPrompt.matchAll(/"id":\s*"(item_[^"]+)"/g)].map(m => m[1]);
      const charIds = [...userPrompt.matchAll(/"id":\s*"(char_\d+)"/g)].map(m => m[1]);

      let groupsInfo = {};
      try {
        const groupsMatch = userPrompt.match(/LOCATIONAL GROUPS \(AREAS\):\s*(\{[^}]+\})/);
        if (groupsMatch) {
          groupsInfo = JSON.parse(groupsMatch[1]);
        }
      } catch(e) {}

      const details = {
        'castle': {
          title: 'The Shadow of Castle Keith',
          teaser: 'Infiltrate the grey brick fortress, avoid the poison gardens, and defeat the evil wizard.',
          intro: 'For years, King Keith has ruled these lands with a fist of iron and a mind corrupted by dark magic. You have been thrown into the depths of his castle, but you will not rot here.\n\nYour goal is to explore the rooms, find the key fragments hidden across the castle and gardens, and escape to freedom.',
          locNames: {
            'group_1': ['Dungeon Cell', 'Chamber of Chains', 'Torture Room', 'Guard Post', 'Throne Room', 'Wine Cellar'],
            'group_2': ['Hedge Maze', 'Poison Rose Garden', 'Overgrown Greenhouse', 'Ancient Fountain', 'Sundial Plaza'],
            'group_3': ['Town Square', 'Abandoned Tavern', 'Blacksmith Forge', 'Desolate Lane', 'Cowering Cottages']
          },
          itemNames: {
            keys: ['Gold Key Shaft', 'Key Teeth', 'Rusted Bow', 'Ornate Key Ring'],
            flavors: ['Rusty Dagger', 'Iron Shield', 'Health Potion', 'Glowing Orb', 'Tattered Map', 'Spell Scroll']
          },
          charNames: ['Weary Prisoner', 'Cowering Townsperson', 'Mad Herbologist', 'Castle Guard']
        },
        'sci-fi': {
          title: 'Decay of Sector 9',
          teaser: 'Explore a derelict spaceship, reboot the reactor core, and escape the vacuum of space.',
          intro: 'The USCS Hyperion went silent three weeks ago. As a lone salvager, you docked to find its crew missing and systems offline. Now, the docking clamp is jammed and the ship is losing orbit.\n\nFind the override keys scattered through the command cabins and engine rooms, restart the primary thrusters, and get out before the ship burns in the atmosphere.',
          locNames: {
            'group_1': ['Cryo Sleep Deck', 'Command Bridge', 'Crew Cabins', 'Navigation Room', 'Comms Array', 'Captain Room'],
            'group_2': ['Reactor Chamber', 'Plasma Tube Station', 'Cooling Vent', 'Power Grid Control', 'High Voltage Conduit'],
            'group_3': ['Main Hangar', 'Magnetic Crate Zone', 'Loading Dock', 'Debris Corridor', 'Trash Compactor']
          },
          itemNames: {
            keys: ['Red Access Chip', 'Blue Keycard', 'Override Cylinders', 'Security Pass'],
            flavors: ['Laser Welder', 'Energy Cell', 'Nanite Repair Kit', 'Flickering Datapad', 'Space Helmet', 'Magnetic Boots']
          },
          charNames: ['Corrupted AI Terminal', 'Wounded Engineer', 'Scavenger Droid', 'Dead Captain Hologram']
        },
        'pirate': {
          title: 'Siren of the Cursed Isle',
          teaser: 'Survive a cursed ship, find the siren cave, and escape with the legendary treasure.',
          intro: 'Captain Redbeard\'s ship sank here a century ago, cursed by the Sirens of the deep. You washed ashore on this mysterious island with nothing but your wits.\n\nTo leave, you must recover the fragments of the Captain\'s compass, unlock the skull cave, and claim the Siren\'s treasure.',
          locNames: {
            'group_1': ['Cursed Shipwreck', 'Captain\'s Cabin', 'Quarterdeck', 'Cargo Hold', 'Flooded Galley'],
            'group_2': ['Sandy Cove', 'Siren Lagoon', 'Shell Grotto', 'Tide Pool', 'Shipwreck Reef'],
            'group_3': ['Dark Jungle Entrance', 'Limestone Cave', 'Skull Gateway', 'Hidden Tunnel', 'Deep Abyss']
          },
          itemNames: {
            keys: ['Compass Needle', 'Glass Lens', 'Cursed Coin', 'Tuning Fork'],
            flavors: ['Cutlass', 'Flintlock Pistol', 'Rum Bottle', 'Spyglass', 'Pirate Map', 'Siren Pearl']
          },
          charNames: ['Skeleton Lookout', 'Friendly Parrot', 'Hermit Crab Trader', 'Lost Sailor Ghost']
        }
      };

      const selectedDetail = details[theme] || details['castle'];
      const locations = [];
      const usedNames = new Set();
      locationIds.forEach((locId) => {
        const regex = new RegExp(`"id"\\s*:\\s*"${locId}"[^}]*"groupId"\\s*:\\s*"([^"]+)"`);
        const match = userPrompt.match(regex);
        const locGroupId = match ? match[1] : 'group_1';

        const namePool = selectedDetail.locNames[locGroupId] || selectedDetail.locNames['group_1'];
        let name = namePool.find(n => !usedNames.has(n));
        if (!name) name = namePool[Math.floor(Math.random() * namePool.length)];
        usedNames.add(name);

        const groupDesc = groupsInfo[locGroupId]?.description || 'a mysterious sector';
        locations.push({
          id: locId,
          name: name,
          shortDescription: `A dynamic room within the ${name} of the area.`,
          imagePrompt: `Cinematic game scene of a ${name} in ${groupDesc}, detailed walls and floors, volumetric lighting.`
        });
      });

      const items = [];
      let keyIdx = 0;
      let flavorIdx = 0;
      itemIds.forEach((itemId) => {
        if (itemId.includes('key')) {
          const keyName = selectedDetail.itemNames.keys[keyIdx % selectedDetail.itemNames.keys.length] + ' ' + (Math.floor(keyIdx / selectedDetail.itemNames.keys.length) + 1);
          items.push({
            id: itemId,
            name: keyName,
            description: `A critical item: ${keyName}, glowing with a soft light.`,
            useDescription: `You insert the ${keyName} to unlock the mechanism.`,
            imagePrompt: `A detailed ${keyName} on a solid black background.`
          });
          keyIdx++;
        } else {
          const flavName = selectedDetail.itemNames.flavors[flavorIdx % selectedDetail.itemNames.flavors.length];
          items.push({
            id: itemId,
            name: flavName,
            description: `A useful looking ${flavName}.`,
            useDescription: `You use the ${flavName}.`,
            imagePrompt: `A high quality game asset of ${flavName} on a black background.`
          });
          flavorIdx++;
        }
      });

      const characters = [];
      let charIdx = 0;
      charIds.forEach((charId) => {
        const charName = selectedDetail.charNames[charIdx % selectedDetail.charNames.length];
        characters.push({
          id: charId,
          name: charName,
          description: `A local inhabitant named ${charName}, watching you warily.`,
          personality: `Cautious but willing to talk.`,
          dialogue: `"Who goes there? Be careful, this place is dangerous."`
        });
        charIdx++;
      });

      return JSON.stringify({
        title: selectedDetail.title,
        description: selectedDetail.teaser,
        introduction: selectedDetail.intro,
        locations,
        items,
        characters
      });
    }

    if (userPrompt.includes('writing content for one location') || userPrompt.includes('LOCATION TO DETAIL')) {
      const nameMatch = userPrompt.match(/Name:\s*([^\n|]+)/);
      const name = nameMatch ? nameMatch[1].trim() : 'Room';
      const shortDescMatch = userPrompt.match(/Short description:\s*([^\n]+)/);
      const shortDesc = shortDescMatch ? shortDescMatch[1].trim() : 'a mysterious room.';
      const fullDescription = `You enter the ${name}. ${shortDesc} You feel a subtle draft, indicating exits nearby.`;
      
      return JSON.stringify({
        fullDescription: fullDescription.slice(0, 150),
        stateDescriptions: {
          "light_lit": `The ${name} is now brightly illuminated by a warm, burning torch, casting dancing shadows.`,
          "mechanism_activated": `The old machinery here has ground into life, humming loudly in the room.`
        }
      });
    }

    return 'Mock text response.';
  }

  function mockChat(messages, systemInstruction, jsonMode) {
    const lastMessageObj = messages[messages.length - 1];
    const lastText = lastMessageObj?.parts?.[0]?.text || '';
    
    const inputMatch = lastText.match(/══ PLAYER INPUT ══\n"([^"]+)"/i);
    const playerInput = inputMatch ? inputMatch[1].trim().toLowerCase() : 'look around';
    
    const locIdMatch = lastText.match(/ID:\s*(loc_\d+)/i);
    const curLocId = locIdMatch ? locIdMatch[1] : 'loc_1';
    
    const exitsMatch = lastText.match(/EXITS:\s*([^\n]+)/i);
    const exitsStr = exitsMatch ? exitsMatch[1] : '';
    const exits = {};
    const lockedExits = {};
    if (exitsStr && exitsStr !== 'none') {
      const parts = exitsStr.split(/,\s*/);
      for (const part of parts) {
        const m = part.match(/([a-zA-Z]+)\s*→\s*[^(]+\((loc_\d+)\)(?:\s*\[LOCKED:\s*requires\s*([^\]=]+)=([^\]]+)\])?/i);
        if (m) {
          const dir = m[1].toLowerCase().trim();
          const destId = m[2];
          exits[dir] = destId;
          if (m[3]) {
            lockedExits[dir] = { key: m[3].trim(), value: m[4].trim() };
          }
        }
      }
    }

    const itemsMatch = lastText.match(/ITEMS HERE:\s*([^\n]+)/i);
    const itemsStr = itemsMatch ? itemsMatch[1] : '';
    const itemsHere = [];
    if (itemsStr && itemsStr !== 'none') {
      const parts = itemsStr.split(/,\s*/);
      for (const part of parts) {
        const m = part.match(/"([^"]+)"\s*\[([^\]]+)\](?:\s*\((fixed)\))?/);
        if (m) {
          itemsHere.push({
            name: m[1],
            id: m[2],
            isFixed: !!m[3]
          });
        }
      }
    }

    const invMatch = lastText.match(/Inventory:\s*([^\n]+)/i);
    const invStr = invMatch ? invMatch[1] : '';
    const inventory = [];
    if (invStr && invStr !== 'empty') {
      const parts = invStr.split(/,\s*/);
      for (const part of parts) {
        const m = part.match(/"([^"]+)"\s*\[([^\]]+)\]/);
        if (m) {
          inventory.push({ name: m[1], id: m[2] });
        }
      }
    }

    const charsMatch = lastText.match(/CHARACTERS:\s*([^\n]+)/i);
    const charsStr = charsMatch ? charsMatch[1] : '';
    const characters = [];
    if (charsStr && charsStr !== 'none') {
      const parts = charsStr.split(/,\s*/);
      for (const part of parts) {
        characters.push(part.trim());
      }
    }

    const stateMatch = lastText.match(/ROOM STATE:\s*(\{.*\})/i);
    let roomState = {};
    if (stateMatch) {
      try {
        roomState = JSON.parse(stateMatch[1]);
      } catch(e) {}
    }

    let narration = 'You look around the room.';
    let action = 'look';
    let destinationLocationId = null;
    let inventoryAdd = [];
    let inventoryRemove = [];
    let stateChanges = [];
    let healthChange = 0;
    let gameWon = false;
    let gameLost = false;

    const moveMatch = playerInput.match(/^(?:go\s+|head\s+|walk\s+)?(north|south|east|west|up|down)$/i);
    if (moveMatch) {
      const dir = moveMatch[1].toLowerCase();
      if (exits[dir]) {
        const lockRule = lockedExits[dir];
        if (lockRule) {
          const isUnlocked = String(roomState[lockRule.key]) === String(lockRule.value);
          if (!isUnlocked) {
            action = 'invalid';
            narration = `The path ${dir} is blocked by a locked door. You need to unlock it first.`;
          } else {
            action = 'move';
            destinationLocationId = exits[dir];
            narration = `You proceed through the unlocked door to the ${dir}.`;
          }
        } else {
          action = 'move';
          destinationLocationId = exits[dir];
          narration = `You walk to the ${dir}.`;
        }
      } else {
        action = 'invalid';
        narration = `You cannot go ${dir} from here.`;
      }
    }
    else if (playerInput.startsWith('pick up ') || playerInput.startsWith('take ') || playerInput.startsWith('get ') || playerInput.startsWith('grab ')) {
      const targetName = playerInput.replace(/^(pick up|take|get|grab)\s+/i, '').trim();
      const foundItem = itemsHere.find(it => it.name.toLowerCase() === targetName || it.id.toLowerCase() === targetName);
      if (foundItem) {
        if (foundItem.isFixed) {
          action = 'invalid';
          narration = `The ${foundItem.name} is fixed in place. You cannot carry it.`;
        } else {
          action = 'pickup';
          inventoryAdd = [foundItem.id];
          narration = `You pick up the ${foundItem.name} and add it to your bag.`;
        }
      } else {
        action = 'invalid';
        narration = `There is no ${targetName} here to pick up.`;
      }
    }
    else if (playerInput.startsWith('use ')) {
      const targetName = playerInput.replace(/^use\s+/i, '').trim();
      const invItem = inventory.find(it => it.name.toLowerCase().includes(targetName) || it.id.toLowerCase() === targetName);
      
      if (invItem) {
        let resolved = false;
        for (const [dir, lockRule] of Object.entries(lockedExits)) {
          const keyIndex = lockRule.key.match(/\d+$/)?.[0];
          const itemIndex = invItem.id.match(/\d+/)?.[0];
          if (keyIndex && itemIndex && keyIndex === itemIndex) {
            action = 'use';
            stateChanges.push({
              locationId: curLocId,
              key: lockRule.key,
              value: true
            });
            narration = `You insert and turn the ${invItem.name}. You hear a heavy clunk as the door to the ${dir} unlocks!`;
            resolved = true;
            break;
          }
        }
        
        if (!resolved) {
          narration = `You use the ${invItem.name}, but nothing obvious happens.`;
          action = 'use';
        }
      } else {
        action = 'invalid';
        narration = `You do not have a ${targetName} in your inventory.`;
      }
    }
    else if (playerInput.startsWith('talk to ') || playerInput.startsWith('speak to ') || playerInput.startsWith('talk ')) {
      const targetName = playerInput.replace(/^(talk to|speak to|talk)\s+/i, '').trim();
      const matchesChar = characters.some(c => c.toLowerCase().includes(targetName));
      if (matchesChar) {
        action = 'talk';
        narration = `The character looks at you and says: "Keep exploring. The key fragments are hidden in various areas of this place."`;
      } else {
        action = 'invalid';
        narration = `There is no one named ${targetName} here to talk to.`;
      }
    }
    else if (playerInput.startsWith('examine ') || playerInput.startsWith('look at ')) {
      const targetName = playerInput.replace(/^(examine|look at)\s+/i, '').trim();
      const foundItem = itemsHere.find(it => it.name.toLowerCase() === targetName || it.id.toLowerCase() === targetName) ||
                        inventory.find(it => it.name.toLowerCase().includes(targetName) || it.id.toLowerCase() === targetName);
      if (foundItem) {
        action = 'examine';
        narration = `It is a detailed ${foundItem.name}. It might be useful in your quest.`;
      } else {
        action = 'invalid';
        narration = `You do not see a ${targetName} here to examine.`;
      }
    }
    else if (playerInput === 'look' || playerInput === 'look around') {
      action = 'look';
      const descMatch = lastText.match(/DESCRIPTION:\s*([^\n]+)/i);
      const desc = descMatch ? descMatch[1] : 'You look around.';
      narration = desc;
      if (itemsHere.length > 0) {
        narration += ` You spot: ${itemsHere.map(it => it.name).join(', ')}.`;
      }
      if (characters.length > 0) {
        narration += ` You see: ${characters.join(', ')}.`;
      }
    }
    else {
      action = 'custom';
      narration = `You decide to "${playerInput}". Nothing special happens.`;
    }

    return JSON.stringify({
      narration,
      action,
      destinationLocationId,
      inventoryAdd,
      inventoryRemove,
      stateChanges,
      healthChange,
      gameWon,
      gameLost
    });
  }

  /* ─── Text generation (single turn) ─────────────────────────────────── */

  async function generateText(userPrompt, systemInstruction = null, jsonMode = false) {
    const key = getKey();
    if (key === 'AIzaSyDummyKeyForTesting') {
      return mockGenerateText(userPrompt, systemInstruction, jsonMode);
    }
    assertKey();
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (jsonMode) body.generationConfig = { responseMimeType: 'application/json' };

    const data = await postJSON(`${BASE}/${getModel()}:generateContent`, body);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response — the model returned no text.');
    return text;
  }

  /* ─── Multi-turn chat ────────────────────────────────────────────────── */

  async function chat(messages, systemInstruction = null, jsonMode = false) {
    const key = getKey();
    if (key === 'AIzaSyDummyKeyForTesting') {
      return mockChat(messages, systemInstruction, jsonMode);
    }
    assertKey();
    const body = { contents: messages };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (jsonMode) body.generationConfig = { responseMimeType: 'application/json' };

    const data = await postJSON(`${BASE}/${getModel()}:generateContent`, body);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini.');
    return text;
  }

  /* ─── Image generation ───────────────────────────────────────────────── */

  async function generateImage(prompt) {
    assertKey();
    const imgModel = getImageModel();

    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] }
      };
      const data = await postJSON(`${BASE}/${imgModel}:generateContent`, body);
      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData?.data) {
          console.log(`✓ Image via :generateContent [${imgModel}]`);
          return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        }
      }
    } catch (err) {
      console.warn(`Image generation failed for [${imgModel}]:`, err.message);
    }

    console.warn(`Image generation failed for model [${imgModel}] — using gradient placeholder`);
    return null;
  }

  /* ─── Key validation — returns { ok, message } ───────────────────────── */

  async function validateKey() {
    const key = getKey();
    if (!key) return { ok: false, message: 'No key entered.' };

    console.log(`Testing key: ${key.slice(0, 6)}… (${key.length} chars) with model: ${getModel()}`);

    try {
      const result = await generateText('Say the word OK.');
      console.log('Validation response:', result);
      return { ok: true, message: `✓ Key works! Model responded: "${result.slice(0, 40)}"` };
    } catch (err) {
      console.error('Validation error:', err.message);
      return { ok: false, message: err.message };
    }
  }

  /* ─── Robust JSON Parsing Utility ─────────────────────────────────────── */

  function parseJSON(raw, label) {
    let cleaned = raw.trim();
    // Strip markdown code fences if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      console.error(`JSON parse failed for "${label}". Error:`, err);
      console.error("Raw response content:", raw);

      // Try cleaning trailing commas and comments
      try {
        let experimentalClean = cleaned
          .replace(/\/\/.*$/gm, '') // Strip single line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // Strip multi-line comments
          .replace(/,\s*([}\]])/g, '$1'); // Strip trailing commas before } or ]
        return JSON.parse(experimentalClean);
      } catch (cleanErr) {
        console.error("Cleaned JSON parse also failed:", cleanErr);
      }

      // Try to salvage the first {...} or [...] block
      const m = cleaned.match(/[\{\[][\s\S]*[\}\]]/);
      if (m) {
        try {
          let block = m[0];
          // Clean trailing commas in the block too
          block = block.replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(block);
        } catch (salvageErr) {
          console.error("Salvage attempt failed:", salvageErr);
        }
      }

      throw new Error(`Failed to parse JSON from: ${label}. Error details: ${err.message}.`);
    }
  }

  return { generateText, chat, generateImage, validateKey, parseJSON };
})();
