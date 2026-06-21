# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Naming
- Use short, concise names for game items — avoid verbose words like "Fragment" when the distinction can be made with numbers or letters. Confidence: 0.75

# Architecture
- Maze generation must follow a strict procedural loop: (A) expand 1-3 rooms from accessible nodes, (B) place primary key for Door [N] strictly behind Door [N-1] — never in the starting area or on parallel branches, so the player is forced to unlock the previous door to find it, (C) 50% chance to place a second key fragment anywhere in previously accessible areas (including starting area) to force backtracking, (D) create a locked door at an open edge with a new room past it. Keys must always be placed before their door to prevent soft-locks. Confidence: 0.90
- The exit/win room must always be placed directly after the last locked door — never reachable from the starting area. The exit BFS must traverse all connections (including locked edges) to find the furthest node past all doors. Confidence: 0.85

