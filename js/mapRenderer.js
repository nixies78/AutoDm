/**
 * AutoDM — Map Renderer
 * Renders adventure maps as SVG using a force-directed layout algorithm.
 */

class MapRenderer {
  constructor(containerId) {
    this.containerId = containerId;
    this.adventure    = null;
    this.currentId    = null;
    this.positions    = {};          // { locId: {x, y} }
    this.onNodeClick  = null;        // optional callback(locationId)
    this.W = 800; this.H = 460;
    this.PAD = 65;
    this.NODE_R = 22;
  }

  /* ─── Public ──────────────────────────────────────────────────────────── */

  render(adventure, currentLocationId = null) {
    this.adventure = adventure;
    this.currentId = currentLocationId;

    const container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!adventure?.locations?.length) {
      container.innerHTML = '<p style="color:#666;text-align:center;padding:2rem">No map data</p>';
      return;
    }

    this._layout(adventure.locations, adventure.connections || []);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    svg.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;';

    this._defs(NS, svg);

    // Background
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', this.W); bg.setAttribute('height', this.H);
    bg.setAttribute('fill', 'transparent');
    svg.appendChild(bg);

    // Zoom group
    const zoomGroup = document.createElementNS(NS, 'g');
    this.zoomGroup = zoomGroup;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;

    // Draw Group Bounding Boxes
    this._drawGroups(NS, zoomGroup, adventure.locations);

    // Draw Floor Separators and Headers
    this._drawFloorHeaders(NS, zoomGroup, adventure.locations);

    // Edges
    for (const conn of adventure.connections || []) {
      this._drawEdge(NS, zoomGroup, conn);
    }

    // Nodes
    for (const loc of adventure.locations) {
      this._drawNode(NS, zoomGroup, loc);
    }

    svg.appendChild(zoomGroup);
    container.appendChild(svg);
    
    this._setupZoom(svg);
  }

  _setupZoom(svg) {
    let isDragging = false;

    svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('g[style*="cursor: pointer"]')) return; // ignore node clicks
      isDragging = true;
      svg.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const dx = e.movementX / ctm.a;
      const dy = e.movementY / ctm.d;
      
      this.tx += dx;
      this.ty += dy;
      this._updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      svg.style.cursor = 'grab';
    });

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = -e.deltaY * 0.0015;
      let newScale = this.scale * (1 + zoomFactor);
      newScale = Math.max(0.4, Math.min(newScale, 4));
      
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      // Get mouse pos relative to the inner coordinate system
      const zoomP = pt.matrixTransform(this.zoomGroup.getScreenCTM().inverse());

      this.tx -= zoomP.x * (newScale - this.scale);
      this.ty -= zoomP.y * (newScale - this.scale);
      this.scale = newScale;

      this._updateTransform();
    }, { passive: false });
    
    // Auto-fit viewport to center all nodes and floors
    this._fitViewport();
  }

  _fitViewport() {
    if (!this.zoomGroup || !this.positions) return;

    const locIds = Object.keys(this.positions);
    if (locIds.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const id of locIds) {
      const pos = this.positions[id];
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const PADDING = 80;
    const targetW = this.W - PADDING * 2;
    const targetH = this.H - PADDING * 2;

    let scale = Math.min(targetW / (w || 1), targetH / (h || 1));
    // Clamp the scale factor to reasonable values
    scale = Math.max(0.4, Math.min(scale, 1.4));

    this.scale = scale;
    this.tx = this.W / 2 - cx * scale;
    this.ty = this.H / 2 - cy * scale;
    this._updateTransform();
  }

  _updateTransform() {
    this.zoomGroup.setAttribute('transform', `translate(${this.tx},${this.ty}) scale(${this.scale})`);
  }

  highlight(locationId) {
    this.currentId = locationId;
    if (this.adventure) this.render(this.adventure, locationId);
  }

  /* ─── Layout ──────────────────────────────────────────────────────────── */

  _layout(locations, connections) {
    const W = this.W, H = this.H;
    
    const grid = {}; 
    const unvisited = new Set(locations.map(l => l.id));
    if (locations.length === 0) return;
    
    // If the generator passed exact grid coordinates, use them!
    let hasCoords = true;
    for (const loc of locations) {
      if (typeof loc.x !== 'number' || typeof loc.y !== 'number') {
        hasCoords = false; break;
      }
    }
    
    const occupied = new Set();
    
    if (hasCoords) {
      for (const loc of locations) {
        grid[loc.id] = {x: loc.x, y: loc.y};
        occupied.add(`${loc.x},${loc.y}`);
        unvisited.delete(loc.id);
      }
    } else {
      const startLoc = locations[0].id;
      grid[startLoc] = {x: 0, y: 0};
      unvisited.delete(startLoc);
      occupied.add('0,0');
    
      const queue = [startLoc];
      
      while (queue.length > 0) {
        const current = queue.shift();
        const pos = grid[current];
        
        const outgoing = connections.filter(c => c.from === current && unvisited.has(c.to));
        const incoming = connections.filter(c => c.to === current && unvisited.has(c.from));
        
        const placeNode = (nodeId, direction, isOutgoing) => {
          let dx = 0, dy = 0;
          let dir = (direction || '').toLowerCase().trim();
          if (dir === 'north' || dir === 'up') dy = isOutgoing ? -1 : 1;
          else if (dir === 'south' || dir === 'down') dy = isOutgoing ? 1 : -1;
          else if (dir === 'east' || dir === 'right') dx = isOutgoing ? 1 : -1;
          else if (dir === 'west' || dir === 'left') dx = isOutgoing ? -1 : 1;
          else { dx = isOutgoing ? 1 : -1; } // fallback to east/west
          
          let targetX = pos.x + dx;
          let targetY = pos.y + dy;
          
          let attempts = 0;
          while (occupied.has(`${targetX},${targetY}`) && attempts < 20) {
             targetX += dx;
             targetY += dy;
             attempts++;
          }
          
          grid[nodeId] = {x: targetX, y: targetY};
          occupied.add(`${targetX},${targetY}`);
          unvisited.delete(nodeId);
          queue.push(nodeId);
        };
        
        for (const conn of outgoing) placeNode(conn.to, conn.direction, true);
        for (const conn of incoming) placeNode(conn.from, conn.direction, false);
      }
    }
    
    let unplacedX = 0, unplacedY = 0;
    for (const locId of unvisited) {
       while (occupied.has(`${unplacedX},${unplacedY}`)) { unplacedX++; }
       grid[locId] = {x: unplacedX, y: unplacedY};
       occupied.add(`${unplacedX},${unplacedY}`);
    }
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pos of Object.values(grid)) {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
    
    const SPACING_X = 100;
    const SPACING_Y = 100;
    
    const offsetX = (minX + maxX) / 2;
    const offsetY = (minY + maxY) / 2;
    
    for (const loc of locations) {
      const gPos = grid[loc.id];
      const zShift = (loc.z || 0) * 350;
      this.positions[loc.id] = {
        x: W / 2 + (gPos.x - offsetX) * SPACING_X + zShift,
        y: H / 2 + (gPos.y - offsetY) * SPACING_Y
      };
    }
  }

  /* ─── SVG helpers ─────────────────────────────────────────────────────── */

  _drawGroups(NS, svg, locations) {
    if (!locations || locations.length === 0) return;

    // Group locations by groupId and z level
    const groups = {};
    for (const loc of locations) {
      if (!loc.groupId) continue;
      const z = loc.z || 0;
      const key = `${loc.groupId}_${z}`;
      if (!groups[key]) {
        let name = loc.groupName || 'Group';
        if (this.adventure && this.adventure.groups && this.adventure.groups[loc.groupId]) {
          name = this.adventure.groups[loc.groupId].name || name;
        }
        
        let displayName = name;
        if (z > 0) displayName += ` (Upper Floor)`;
        else if (z < 0) displayName += ` (Lower Floor)`;

        groups[key] = {
          id: loc.groupId,
          name: displayName,
          locs: []
        };
      }
      groups[key].locs.push(loc);
    }

    // Group colors map (matching standard premium styling: Pink, Blue, Green, fallback Purple)
    const groupColors = {
      group_1: { border: '#ec4899', fill: 'rgba(236, 72, 153, 0.04)' },
      group_2: { border: '#3b82f6', fill: 'rgba(59, 130, 246, 0.04)' },
      group_3: { border: '#22c55e', fill: 'rgba(34, 197, 94, 0.04)' }
    };
    const defaultColor = { border: '#a855f7', fill: 'rgba(168, 85, 247, 0.04)' };

    const PAD = 38;
    const labels = [];

    for (const [key, group] of Object.entries(groups)) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let hasPositions = false;

      for (const loc of group.locs) {
        const pos = this.positions[loc.id];
        if (pos) {
          hasPositions = true;
          if (pos.x < minX) minX = pos.x;
          if (pos.x > maxX) maxX = pos.x;
          if (pos.y < minY) minY = pos.y;
          if (pos.y > maxY) maxY = pos.y;
        }
      }

      if (!hasPositions) continue;

      const colors = groupColors[group.id] || defaultColor;

      const rectX = minX - PAD;
      const rectY = minY - PAD;
      const rectW = (maxX - minX) + 2 * PAD;
      const rectH = (maxY - minY) + 2 * PAD;

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', rectX);
      rect.setAttribute('y', rectY);
      rect.setAttribute('width', rectW);
      rect.setAttribute('height', rectH);
      rect.setAttribute('rx', '12');
      rect.setAttribute('fill', colors.fill);
      rect.setAttribute('stroke', colors.border);
      rect.setAttribute('stroke-width', '4');
      rect.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(rect);

      // Collect label info (to be drawn outside/above the box)
      const pillW = Math.max(75, group.name.length * 6.5 + 16);
      const pillH = 18;
      labels.push({
        name: group.name,
        border: colors.border,
        w: pillW,
        h: pillH,
        x: rectX + (rectW - pillW) / 2,
        y: rectY - 22 // 22px above the box top edge
      });
    }

    // Resolve overlaps iteratively (push apart colliding labels)
    for (let pass = 0; pass < 5; pass++) {
      let collided = false;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i];
          const b = labels[j];
          
          const overlapX = (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
          const overlapY = (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          
          if (overlapX > -10 && overlapY > -10) {
            collided = true;
            const dx = (a.x + a.w/2) - (b.x + b.w/2);
            const dy = (a.y + a.h/2) - (b.y + b.h/2);
            
            if (Math.abs(dx) > Math.abs(dy)) {
              const push = (overlapX + 10) / 2;
              if (dx > 0) {
                a.x += push;
                b.x -= push;
              } else {
                a.x -= push;
                b.x += push;
              }
            } else {
              const push = (overlapY + 10) / 2;
              if (dy > 0) {
                a.y += push;
                b.y -= push;
              } else {
                a.y -= push;
                b.y += push;
              }
            }
          }
        }
      }
      if (!collided) break;
    }

    // Draw resolved labels
    for (const label of labels) {
      const pill = document.createElementNS(NS, 'rect');
      pill.setAttribute('x', label.x);
      pill.setAttribute('y', label.y);
      pill.setAttribute('width', label.w);
      pill.setAttribute('height', label.h);
      pill.setAttribute('rx', '4');
      pill.setAttribute('fill', label.border);
      svg.appendChild(pill);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', label.x + label.w / 2);
      text.setAttribute('y', label.y + label.h / 2 + 3);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-size', '9');
      text.setAttribute('font-family', 'Inter, sans-serif');
      text.setAttribute('font-weight', 'bold');
      text.textContent = label.name;
      svg.appendChild(text);
    }
  }

  _drawFloorHeaders(NS, svg, locations) {
    const zLevels = [...new Set(locations.map(l => l.z || 0))].sort((a, b) => a - b);

    const getFloorLabel = (z) => {
      if (z === 0) return 'GROUND LEVEL';
      if (z === 1) return 'UPPER LEVEL';
      if (z === -1) return 'LOWER LEVEL';
      if (z > 1) return `UPPER LEVEL ${z}`;
      return `LOWER LEVEL ${Math.abs(z)}`;
    };

    const getFloorColor = (z) => {
      if (z === 0) return '#64748b'; // Slate
      if (z > 0) return '#3b82f6';   // Blue
      return '#22c55e';              // Green
    };

    for (const z of zLevels) {
      const floorRooms = locations.filter(l => (l.z || 0) === z);
      if (floorRooms.length === 0) continue;

      let minX = Infinity, maxX = -Infinity, minY = Infinity;
      for (const loc of floorRooms) {
        const pos = this.positions[loc.id];
        if (pos) {
          if (pos.x < minX) minX = pos.x;
          if (pos.x > maxX) maxX = pos.x;
          if (pos.y < minY) minY = pos.y;
        }
      }

      if (minX === Infinity) continue;

      const centerX = (minX + maxX) / 2;
      const labelText = getFloorLabel(z);
      const color = getFloorColor(z);

      // Draw vertical separator line between floors
      if (zLevels.length > 1) {
        const idx = zLevels.indexOf(z);
        const nextZ = zLevels[idx + 1];
        if (nextZ !== undefined) {
          const nextRooms = locations.filter(l => (l.z || 0) === nextZ);
          let nextMinX = Infinity;
          for (const loc of nextRooms) {
            const pos = this.positions[loc.id];
            if (pos && pos.x < nextMinX) nextMinX = pos.x;
          }
          if (nextMinX !== Infinity) {
            const separatorX = (maxX + nextMinX) / 2;
            const sepLine = document.createElementNS(NS, 'line');
            sepLine.setAttribute('x1', separatorX);
            sepLine.setAttribute('y1', -2000);
            sepLine.setAttribute('x2', separatorX);
            sepLine.setAttribute('y2', 2000);
            sepLine.setAttribute('stroke', 'rgba(255,255,255,0.06)');
            sepLine.setAttribute('stroke-width', '1.5');
            sepLine.setAttribute('stroke-dasharray', '8,8');
            svg.appendChild(sepLine);
          }
        }
      }

      // Draw floor label badge/pill
      const pillW = labelText.length * 6.5 + 20;
      const pillH = 22;
      const pillX = centerX - pillW / 2;
      const pillY = minY !== Infinity ? minY - 80 : 15;

      const pill = document.createElementNS(NS, 'rect');
      pill.setAttribute('x', pillX);
      pill.setAttribute('y', pillY);
      pill.setAttribute('width', pillW);
      pill.setAttribute('height', pillH);
      pill.setAttribute('rx', '11');
      pill.setAttribute('fill', 'rgba(15,23,42,0.9)');
      pill.setAttribute('stroke', color);
      pill.setAttribute('stroke-width', '1.5');
      svg.appendChild(pill);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', centerX);
      text.setAttribute('y', pillY + 14);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', color);
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'Inter, sans-serif');
      text.setAttribute('font-weight', '800');
      text.setAttribute('letter-spacing', '0.05em');
      text.textContent = labelText;
      svg.appendChild(text);
    }
  }

  _defs(NS, svg) {
    const defs = document.createElementNS(NS, 'defs');

    const makeGrad = (id, c1, c2) => {
      const g = document.createElementNS(NS, 'linearGradient');
      g.setAttribute('id', id);
      g.setAttribute('x1', '0%'); g.setAttribute('y1', '0%');
      g.setAttribute('x2', '100%'); g.setAttribute('y2', '100%');
      [[c1, '0%'], [c2, '100%']].forEach(([c, o]) => {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', o); s.setAttribute('stop-color', c);
        g.appendChild(s);
      });
      defs.appendChild(g);
    };

    makeGrad('ngNormal',  '#6366f1', '#06b6d4');
    makeGrad('ngActive',  '#f59e0b', '#ef4444');
    makeGrad('ngStart',   '#22c55e', '#06b6d4');
    makeGrad('ngExit',    '#a855f7', '#ec4899');

    // Glow filter
    const flt = document.createElementNS(NS, 'filter');
    flt.setAttribute('id', 'glow');
    flt.setAttribute('x', '-50%'); flt.setAttribute('y', '-50%');
    flt.setAttribute('width', '200%'); flt.setAttribute('height', '200%');
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '4');
    blur.setAttribute('result', 'coloredBlur');
    const merge = document.createElementNS(NS, 'feMerge');
    ['coloredBlur', 'SourceGraphic'].forEach(inp => {
      const mn = document.createElementNS(NS, 'feMergeNode');
      mn.setAttribute('in', inp);
      merge.appendChild(mn);
    });
    flt.appendChild(blur); flt.appendChild(merge);
    defs.appendChild(flt);

    svg.appendChild(defs);
  }

  _drawEdge(NS, svg, conn) {
    const pa = this.positions[conn.from];
    const pb = this.positions[conn.to];
    if (!pa || !pb) return;

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', pa.x); line.setAttribute('y1', pa.y);
    line.setAttribute('x2', pb.x); line.setAttribute('y2', pb.y);
    
    // Detect vertical connections
    const locA = this.adventure.locations.find(l => l.id === conn.from);
    const locB = this.adventure.locations.find(l => l.id === conn.to);
    const isVertical = locA && locB && (locA.z !== locB.z);

    // Connection styling
    if (isVertical) {
      line.setAttribute('stroke', '#a855f7'); // Purple for stairs
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6,4');
    } else if (conn.type === 'locked') {
      line.setAttribute('stroke', '#ef4444'); // Red
      line.setAttribute('stroke-width', '2');
    } else if (conn.type === 'hidden') {
      line.setAttribute('stroke', '#3b82f6'); // Blue
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4,4');
    } else {
      line.setAttribute('stroke', '#22c55e'); // Green
      line.setAttribute('stroke-width', '2');
    }
    svg.appendChild(line);

    // Midpoint coordinates
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;

    if (isVertical) {
      const goesUp = locA.z < locB.z;
      
      const badge = document.createElementNS(NS, 'g');
      badge.setAttribute('transform', `translate(${mx},${my})`);
      
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('fill', 'rgba(168, 85, 247, 0.95)');
      bg.setAttribute('x', '-22'); bg.setAttribute('y', '-8');
      bg.setAttribute('width', '44'); bg.setAttribute('height', '16');
      bg.setAttribute('rx', '4');
      badge.appendChild(bg);

      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('y', '4');
      lbl.setAttribute('font-size', '8');
      lbl.setAttribute('fill', '#fff');
      lbl.setAttribute('font-weight', 'bold');
      lbl.setAttribute('font-family', 'Inter, sans-serif');
      lbl.textContent = goesUp ? '▲ UP' : '▼ DOWN';
      badge.appendChild(lbl);
      svg.appendChild(badge);
    } else {
      // Status icon (only for locked/hidden)
      let txt = '';
      if (conn.type === 'locked') txt = '🔒';
      if (conn.type === 'hidden') txt = '👀';
      
      if (txt) {
        const isLocked = conn.type === 'locked';
        const lockLabel = isLocked && conn.lockIndex ? ` #${conn.lockIndex}` : '';
        const fullText = txt + lockLabel;
        
        const lbl = document.createElementNS(NS, 'text');
        lbl.setAttribute('x', mx); lbl.setAttribute('y', my + 4);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', isLocked ? '11' : '12');
        lbl.setAttribute('fill', '#fff');
        lbl.textContent = fullText;
        
        const textWidth = isLocked ? 32 : 20;
        const bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('fill', 'rgba(15,23,42,0.8)');
        bg.setAttribute('x', mx - textWidth / 2); bg.setAttribute('y', my - 8);
        bg.setAttribute('width', textWidth); bg.setAttribute('height', '16');
        bg.setAttribute('rx', '4');
        svg.appendChild(bg);
        svg.appendChild(lbl);
      }
    }
  }

  _drawNode(NS, svg, loc) {
    const pos = this.positions[loc.id];
    if (!pos) return;

    const isCurrent = loc.id === this.currentId;
    const R = this.NODE_R;
    const SIZE = R * 2;

    // Only start & exit get distinct colors; everything else is blue
    const roleGrad = (loc.role === 'starting' || loc.role === 'exit')
      ? ({ starting: 'ngStart', exit: 'ngExit' })[loc.role]
      : 'ngNormal';

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
    g.style.cursor = 'pointer';

    // Pulse ring for current
    if (isCurrent) {
      const ring = document.createElementNS(NS, 'rect');
      ring.setAttribute('x', -R - 5); ring.setAttribute('y', -R - 5);
      ring.setAttribute('width', SIZE + 10); ring.setAttribute('height', SIZE + 10);
      ring.setAttribute('rx', '8');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#f59e0b');
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('opacity', '0.5');
      ring.setAttribute('filter', 'url(#glow)');
      g.appendChild(ring);
    }

    // Main square
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', -R); rect.setAttribute('y', -R);
    rect.setAttribute('width', SIZE); rect.setAttribute('height', SIZE);
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', `url(#${isCurrent ? 'ngActive' : roleGrad})`);
    rect.setAttribute('stroke', isCurrent ? '#f59e0b' : 'rgba(255,255,255,0.15)');
    rect.setAttribute('stroke-width', isCurrent ? '2.5' : '1.5');
    if (isCurrent) rect.setAttribute('filter', 'url(#glow)');
    g.appendChild(rect);

    // Emoji icon — only on start / exit rooms
    if (loc.role === 'starting' || loc.role === 'exit') {
      const emojiMap = { starting: '🚪', exit: '🏁' };
      const icon = document.createElementNS(NS, 'text');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('dominant-baseline', 'central');
      icon.setAttribute('font-size', '16');
      icon.setAttribute('y', '2');
      icon.textContent = emojiMap[loc.role];
      g.appendChild(icon);
    }

    // Room-number badge (white circle top-right)
    const roomNum = (loc.id || '').match(/\d+/);
    if (roomNum) {
      const badgeGroup = document.createElementNS(NS, 'g');
      badgeGroup.setAttribute('transform', `translate(${R - 9},${-R - 2})`);
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', '0'); circle.setAttribute('cy', '0');
      circle.setAttribute('r', '10');
      circle.setAttribute('fill', '#ffffff');
      badgeGroup.appendChild(circle);
      const numText = document.createElementNS(NS, 'text');
      numText.setAttribute('x', '0'); numText.setAttribute('y', '3');
      numText.setAttribute('text-anchor', 'middle');
      numText.setAttribute('font-size', '9');
      numText.setAttribute('font-weight', 'bold');
      numText.setAttribute('fill', '#1e293b');
      numText.textContent = roomNum[0];
      badgeGroup.appendChild(numText);
      g.appendChild(badgeGroup);
    }

    // Role Badges (START / WIN)
    if (loc.role === 'starting' || loc.role === 'exit') {
      const badgeGroup = document.createElementNS(NS, 'g');
      badgeGroup.setAttribute('transform', `translate(${-R - 10},${-R - 10})`); // Top left
      
      const badgeBg = document.createElementNS(NS, 'rect');
      badgeBg.setAttribute('x', '0'); badgeBg.setAttribute('y', '0');
      badgeBg.setAttribute('width', loc.role === 'starting' ? '36' : '30'); 
      badgeBg.setAttribute('height', '14');
      badgeBg.setAttribute('rx', '4');
      badgeBg.setAttribute('fill', loc.role === 'starting' ? '#22c55e' : '#a855f7');
      badgeGroup.appendChild(badgeBg);

      const badgeText = document.createElementNS(NS, 'text');
      badgeText.setAttribute('x', loc.role === 'starting' ? '18' : '15'); 
      badgeText.setAttribute('y', '10');
      badgeText.setAttribute('text-anchor', 'middle');
      badgeText.setAttribute('fill', '#fff');
      badgeText.setAttribute('font-size', '8');
      badgeText.setAttribute('font-family', 'Inter, sans-serif');
      badgeText.setAttribute('font-weight', 'bold');
      badgeText.textContent = loc.role === 'starting' ? 'START' : 'WIN';
      badgeGroup.appendChild(badgeText);
      
      g.appendChild(badgeGroup);
    }

    // Items labels below name — keys only
    if (loc.items && loc.items.length > 0 && this.adventure && this.adventure.items) {
      let keyIdx = 0;
      loc.items.forEach((itemId) => {
        const itemObj = this.adventure.items.find(i => i.id === itemId);
        if (itemObj && itemObj.resolvesState) {
          const itemLbl = document.createElementNS(NS, 'text');
          itemLbl.setAttribute('y', R + 14 + (keyIdx * 12));
          itemLbl.setAttribute('text-anchor', 'middle');
          itemLbl.setAttribute('fill', '#fcd34d');
          itemLbl.setAttribute('font-size', '9');
          itemLbl.setAttribute('font-family', 'Inter, sans-serif');
          
          const name = itemObj.name.length > 15 ? itemObj.name.slice(0, 12) + '…' : itemObj.name;
          itemLbl.textContent = `🔑 ${name}`;
          g.appendChild(itemLbl);
          keyIdx++;
        }
      });
    }

    // Click handler
    g.addEventListener('click', () => {
      if (this.onNodeClick) this.onNodeClick(loc.id);
    });

    svg.appendChild(g);
  }
}

/** Extract the numeric lock index from a state key like "door_open_1" */
function extractLockIndex(stateKey) {
  const m = String(stateKey).match(/(\d+)$/);
  return m ? m[1] : '';
}
