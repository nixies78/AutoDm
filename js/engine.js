/**
 * AutoDM — Game Engine
 * Manages all mutable game state and exposes helpers for
 * the LLM system prompt and action application.
 */

class GameEngine {
  constructor() {
    this.adventure  = null;
    this.gameState  = null;
  }

  /* ─── Initialisation ─────────────────────────────────────────────────── */

  init(adventure, savedState = null) {
    this.adventure = adventure;

    if (savedState) {
      this.gameState = savedState;
    } else {
      const start = adventure.locations.find(l => l.role === 'starting')
                 || adventure.locations[0];
      this.gameState = {
        adventureId:     adventure.id,
        currentLocation: start.id,
        player: { name: 'Adventurer', health: 100, maxHealth: 100 },
        inventory:       [],
        locationStates:  {},   // { locId: { key: value, takenItems:[], … } }
        isWon:  false,
        isLost: false
      };
    }
    return this.gameState;
  }

  /* ─── Accessors ──────────────────────────────────────────────────────── */

  getLocation(id)       { return this.adventure.locations.find(l => l.id === id) || null; }
  getCurrentLocation()  { return this.getLocation(this.gameState.currentLocation); }
  getItem(id)           { return (this.adventure.items || []).find(i => i.id === id) || null; }
  getCharacter(id)      { return (this.adventure.characters || []).find(c => c.id === id) || null; }

  /** Description of a location, honouring active state overrides */
  getLocationDescription(locationId) {
    const loc   = this.getLocation(locationId);
    if (!loc) return '';
    const state = this.gameState.locationStates[locationId] || {};

    let desc = '';
    for (const [key, d] of Object.entries(loc.stateDescriptions || {})) {
      if (state[key]) {
        desc = d;
        break;
      }
    }
    if (!desc) desc = loc.fullDescription || loc.shortDescription || '';
    
    const words = desc.split(/\s+/);
    if (words.length > 30) {
      return words.slice(0, 30).join(' ') + '...';
    }
    return desc;
  }

  /** Items present in a location (minus what the player has already picked up) */
  getLocationItems(locationId) {
    const loc   = this.getLocation(locationId);
    if (!loc) return [];
    const taken = (this.gameState.locationStates[locationId] || {}).takenItems || [];
    // Also include items that were dropped here
    const dropped = (this.gameState.locationStates[locationId] || {}).droppedItems || [];
    return [...(loc.items || []).filter(id => !taken.includes(id)), ...dropped];
  }

  /** Characters present in a location */
  getLocationCharacters(locationId) {
    const loc = this.getLocation(locationId);
    if (!loc) return [];
    const removed = (this.gameState.locationStates[locationId] || {}).removedChars || [];
    return (loc.characters || []).filter(id => !removed.includes(id));
  }

  /* ─── Action application ─────────────────────────────────────────────── */

  applyAction(actionResult) {
    const changes = [];

    // ── Move
    if (actionResult.action === 'move' && actionResult.destinationLocationId) {
      const dest = this.getLocation(actionResult.destinationLocationId);
      if (dest) {
        this.gameState.currentLocation = dest.id;
        changes.push({ type: 'moved', locationId: dest.id });
      }
    }

    // ── Inventory add
    for (const itemId of (actionResult.inventoryAdd || [])) {
      if (!this.gameState.inventory.includes(itemId)) {
        this.gameState.inventory.push(itemId);
        changes.push({ type: 'item_added', itemId });
      }
      // Mark as taken in the source location
      const locId  = this.gameState.currentLocation;
      const locSt  = this._locState(locId);
      if (!locSt.takenItems) locSt.takenItems = [];
      if (!locSt.takenItems.includes(itemId)) locSt.takenItems.push(itemId);
      // Remove from dropped if it was there
      if (locSt.droppedItems) {
        locSt.droppedItems = locSt.droppedItems.filter(id => id !== itemId);
      }
    }

    // ── Inventory remove
    for (const itemId of (actionResult.inventoryRemove || [])) {
      this.gameState.inventory = this.gameState.inventory.filter(i => i !== itemId);
      changes.push({ type: 'item_removed', itemId });
      // Drop into current location
      const locId = this.gameState.currentLocation;
      const locSt = this._locState(locId);
      if (!locSt.droppedItems) locSt.droppedItems = [];
      if (!locSt.droppedItems.includes(itemId)) locSt.droppedItems.push(itemId);
    }

    // ── State changes
    for (const sc of (actionResult.stateChanges || [])) {
      if (!sc || typeof sc !== 'object' || !sc.key) continue;
      const locId = sc.locationId || this.gameState.currentLocation;
      if (!locId) continue;
      const locSt = this._locState(locId);
      locSt[sc.key] = sc.value;
      changes.push({ type: 'state_change', ...sc });
    }

    // ── Health
    if (actionResult.healthChange) {
      const old = this.gameState.player.health;
      this.gameState.player.health = Math.max(0, Math.min(
        this.gameState.player.maxHealth,
        old + actionResult.healthChange
      ));
      changes.push({ type: 'health', delta: actionResult.healthChange });
    }

    // ── Explicit win/lose from LLM
    if (actionResult.gameWon)  this.gameState.isWon  = true;
    if (actionResult.gameLost) this.gameState.isLost = true;

    // ── Always check engine-side win condition
    this.checkWinCondition();
    if (this.gameState.player.health <= 0) this.gameState.isLost = true;

    return changes;
  }

  checkWinCondition() {
    if (this.gameState.isWon) return true;
    const wc = this.adventure?.winCondition;
    if (!wc) return false;

    let won = false;
    const gs = this.gameState;

    switch (wc.type) {
      case 'reach_location':
        won = gs.currentLocation === wc.locationId;
        break;
      case 'have_item':
        won = gs.inventory.includes(wc.itemId);
        break;
      case 'item_at_location':
        won = gs.inventory.includes(wc.itemId) && gs.currentLocation === wc.locationId;
        break;
      case 'state_change': {
        const st = (gs.locationStates[wc.locationId] || {});
        won = String(st[wc.stateKey]) === String(wc.stateValue);
        break;
      }
      case 'use_item_on_location': {
        const st = (gs.locationStates[wc.locationId] || {});
        won = !!st[wc.stateKey];
        break;
      }
    }

    if (won) gs.isWon = true;
    return won;
  }

  /* ─── LLM context builder ────────────────────────────────────────────── */

  getSystemContext() {
    const loc   = this.getCurrentLocation();
    const gs    = this.gameState;
    const desc  = this.getLocationDescription(gs.currentLocation);
    const items = this.getLocationItems(gs.currentLocation);
    const chars = this.getLocationCharacters(gs.currentLocation);
    const locSt = gs.locationStates[gs.currentLocation] || {};

    const exitsStr = Object.entries(loc?.exits || {})
      .map(([dir, id]) => {
        const d = this.getLocation(id);
        const lockedRule = loc?.lockedExits?.[dir];
        let lockStr = '';
        if (lockedRule) {
          const isUnlocked = String(locSt[lockedRule.stateKey]) === String(lockedRule.stateValue);
          if (!isUnlocked) lockStr = ` [LOCKED: requires ${lockedRule.stateKey}=${lockedRule.stateValue}]`;
        }
        return `${dir} → ${d?.name || id} (${id})${lockStr}`;
      }).join(', ') || 'none';

    const itemStr = items.map(id => {
      const it = this.getItem(id);
      return it ? `"${it.name}" [${id}]${it.takeable === false ? ' (fixed)' : ''}`
                : `[${id}]`;
    }).join(', ') || 'none';

    const invStr  = gs.inventory.map(id => {
      const it = this.getItem(id);
      return it ? `"${it.name}" [${id}]` : `[${id}]`;
    }).join(', ') || 'empty';

    const charStr = chars.map(id => {
      const c = this.getCharacter(id);
      return c ? `${c.name} [${id}]` : id;
    }).join(', ') || 'none';

    // Full location catalogue
    const locCatalogue = this.adventure.locations.map(l =>
      `  ${l.id} "${l.name}" | exits: ${JSON.stringify(l.exits || {})}`
    ).join('\n');

    // Full item catalogue
    const itemCatalogue = (this.adventure.items || []).map(it =>
      `  ${it.id} "${it.name}" | takeable:${it.takeable !== false} usable:${!!it.usable} | ${it.description}`
    ).join('\n');

    // Full character catalogue
    const charCatalogue = (this.adventure.characters || []).map(c =>
      `  ${c.id} "${c.name}" | givesItem:${c.givesItem || 'none'} | ${c.personality}`
    ).join('\n');

    return `=== ADVENTURE: ${this.adventure.title} ===
GOAL: ${this.adventure.goal}
WIN CONDITION: ${JSON.stringify(this.adventure.winCondition)}

--- CURRENT LOCATION ---
ID:          ${loc?.id}
NAME:        ${loc?.name}
DESCRIPTION: ${desc}
EXITS:       ${exitsStr}
ITEMS HERE:  ${itemStr}
CHARACTERS:  ${charStr}
ROOM STATE:  ${JSON.stringify(locSt)}

--- PLAYER ---
Health:    ${gs.player.health}/${gs.player.maxHealth}
Inventory: ${invStr}

--- WORLD CATALOGUE ---
LOCATIONS:
${locCatalogue}

ITEMS:
${itemCatalogue}

CHARACTERS:
${charCatalogue}`;
  }

  /* ─── Persistence ────────────────────────────────────────────────────── */

  toSaveData() { return JSON.parse(JSON.stringify(this.gameState)); }

  /* ─── Private ────────────────────────────────────────────────────────── */

  _locState(locationId) {
    if (!locationId) return {};
    if (!this.gameState.locationStates[locationId]) {
      this.gameState.locationStates[locationId] = {};
    }
    return this.gameState.locationStates[locationId];
  }
}
