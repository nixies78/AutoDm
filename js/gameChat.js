/**
 * AutoDM — Game Chat Module
 * Bridges the player's natural language input with the Gemini API
 * and the game engine's action system.
 */

class GameChat {
  constructor(engine, api) {
    this.engine  = engine;
    this.api     = api;
    this.history = [];   // Gemini multi-turn message array
    this.MAX_HISTORY = 24; // keep last 12 exchanges
  }

  /* ─── System prompt ──────────────────────────────────────────────────── */

  buildSystemPrompt() {
    return `You are the omniscient narrator and game master of a text adventure game.
Your role is to interpret the player's natural-language input and translate it into structured game actions while delivering vivid, atmospheric narration.

════════ STRICT RULES ════════
1. ALWAYS respond with ONLY valid JSON — no preamble, no markdown fences, no extra text.
2. Ground every action in the current world state provided. Never invent exits, items, or characters that don't exist in the catalogue.
3. If the player's request is impossible or nonsensical, set action:"invalid" and explain why in the narration.
4. Allow creative phrasings: "go north", "head north", "walk through the northern door", "north" — all mean the same.
5. Track item interactions: players can PICK UP takeable items, DROP inventory items, USE items (on things/characters).
6. If a character has givesItem set and the interaction triggers it, add that item to inventoryAdd.
7. Update location states when events change the environment (fire goes out, door opens, etc.).
8. Set gameWon:true ONLY when the adventure's win condition is definitively satisfied based on world state.
9. Narration should be MAXIMUM 30 words; match the adventure's style. DO NOT mention the overall goal/objective in the narration.
10. Health changes should be rare and only when story logic demands (traps, falls, etc.).
11. If an exit is marked as [LOCKED] in EXITS, you must NOT allow the player to move there. The player must first perform an action to unlock it (setting the required stateKey to the stateValue). Respond with action: "invalid" and describe the blockage in the narration.

════════ JSON RESPONSE SCHEMA ════════
{
  "narration": "string — atmospheric description of what happens",
  "action": "move|pickup|drop|use|examine|talk|look|wait|invalid|custom",
  "destinationLocationId": "string|null — target location id if action is 'move'",
  "inventoryAdd":    ["item_id"],
  "inventoryRemove": ["item_id"],
  "stateChanges": [
    { "locationId": "string", "key": "string", "value": "any" }
  ],
  "healthChange": 0,
  "gameWon":  false,
  "gameLost": false
}`;
  }

  /* ─── Main send ──────────────────────────────────────────────────────── */

  async sendMessage(userInput) {
    const context = this.engine.getSystemContext();

    // Build the user turn with world state prepended
    const userTurn = {
      role: 'user',
      parts: [{ text: `${context}\n\n══ PLAYER INPUT ══\n"${userInput}"` }]
    };
    this.history.push(userTurn);

    // Trim history to avoid bloating the context window
    if (this.history.length > this.MAX_HISTORY) {
      // Always keep the first exchange (initial 'look') as anchor
      this.history = [
        ...this.history.slice(0, 2),
        ...this.history.slice(-(this.MAX_HISTORY - 2))
      ];
    }

    const responseText = await this.api.chat(
      this.history,
      this.buildSystemPrompt(),
      true  // request JSON mode
    );

    // Add model turn to history
    this.history.push({ role: 'model', parts: [{ text: responseText }] });

    return this._parse(responseText);
  }

  /* ─── Auto-look on load ──────────────────────────────────────────────── */

  async look() {
    return this.sendMessage('look around');
  }

  /* ─── Parsing ────────────────────────────────────────────────────────── */

  _parse(text) {
    try {
      const result = GeminiAPI.parseJSON(text, 'Game chat action');

      // Normalise optional fields
      result.inventoryAdd    = result.inventoryAdd    || [];
      result.inventoryRemove = result.inventoryRemove || [];
      result.stateChanges    = result.stateChanges    || [];
      result.healthChange    = result.healthChange    ?? 0;
      result.gameWon         = result.gameWon         ?? false;
      result.gameLost        = result.gameLost        ?? false;
      result.action          = result.action          || 'custom';

      if (!result.narration) result.narration = '…';

      return result;
    } catch (err) {
      console.warn('GameChat parse error:', err, '\nRaw text:', text);
      return {
        narration:      text.length < 800 ? text : 'Something shifts in the world around you.',
        action:         'custom',
        inventoryAdd:   [],
        inventoryRemove:[],
        stateChanges:   [],
        healthChange:   0,
        gameWon:        false,
        gameLost:       false
      };
    }
  }

  /* ─── Reset ──────────────────────────────────────────────────────────── */

  reset() { this.history = []; }
}
