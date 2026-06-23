/**
 * AutoDM — Application Controller
 * Ties all modules together; manages screen transitions, event handling,
 * the generation pipeline, and the play session.
 */

/* ════════════════════════════════════════════════════════════════════════
   PARTICLE BACKGROUND
   ════════════════════════════════════════════════════════════════════════ */

function initParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.3,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    a: Math.random() * 0.6 + 0.2
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99,102,241,${p.a})`;
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ════════════════════════════════════════════════════════════════════════
   TOAST HELPER
   ════════════════════════════════════════════════════════════════════════ */

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/* ════════════════════════════════════════════════════════════════════════
   SCREEN ROUTER
   ════════════════════════════════════════════════════════════════════════ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });
  const screen = document.getElementById(`screen-${id}`);
  if (screen) {
    screen.classList.add('active');
    screen.classList.remove('screen-fade-in');
    void screen.offsetWidth; // reflow
    screen.classList.add('screen-fade-in');
  }
}

/* ════════════════════════════════════════════════════════════════════════
   GRADIENT PLACEHOLDER for location images
   ════════════════════════════════════════════════════════════════════════ */

const ROLE_GRADIENTS = {
  starting:    'linear-gradient(135deg,#1e3a5f,#0f4c75)',
  puzzle:      'linear-gradient(135deg,#2d1b69,#553c9a)',
  treasure:    'linear-gradient(135deg,#7c3f00,#c56d00)',
  exploration: 'linear-gradient(135deg,#1a4731,#2d6a4f)',
  boss:        'linear-gradient(135deg,#4a0404,#7c0909)',
  exit:        'linear-gradient(135deg,#2c003e,#6b21a8)'
};
const ROLE_EMOJI = { starting:'🚪', puzzle:'🔮', treasure:'💎', exploration:'🗺️', boss:'💀', exit:'🏁' };

function locationImage(loc, className = '') {
  if (loc.image) {
    return `<img src="${loc.image}" alt="${loc.name}" class="${className}" loading="lazy">`;
  }
  const grad  = ROLE_GRADIENTS[loc.role] || 'linear-gradient(135deg,#1e1e3f,#2d2d6b)';
  const emoji = ROLE_EMOJI[loc.role] || '🏛';
  return `<div class="location-image-placeholder ${className}" style="background:${grad}">${emoji}</div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   HOME SCREEN
   ════════════════════════════════════════════════════════════════════════ */

function setupHome() {
  document.getElementById('btn-new-adventure').addEventListener('click', () => {
    if (!Storage.getSetting('apiKey', '')) {
      showToast('Please set your API key in Settings first', 'error');
      showScreen('settings');
      return;
    }
    showScreen('generate');
  });

  document.getElementById('btn-load-adventure').addEventListener('click', () => {
    showScreen('adventures');
    loadAdventuresList();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    showScreen('settings');
    loadSettings();
  });

  // Show API notice if key missing
  const notice = document.getElementById('api-key-notice');
  if (!Storage.getSetting('apiKey', '')) {
    notice.classList.remove('hidden');
  }
}

/* ════════════════════════════════════════════════════════════════════════
   SETTINGS SCREEN
   ════════════════════════════════════════════════════════════════════════ */

function loadSettings() {
  const keyInput  = document.getElementById('input-api-key');
  const modelSel  = document.getElementById('select-model');
  const imgSel    = document.getElementById('select-image-model');
  keyInput.value  = Storage.getSetting('apiKey', '');
  modelSel.value  = Storage.getSetting('model', 'gemini-3.5-flash');
  
  let imgModel = Storage.getSetting('imageModel', 'gemini-3.1-flash-image');
  if (imgModel === 'nano-banana-2') {
    imgModel = 'gemini-3.1-flash-image';
    Storage.setSetting('imageModel', imgModel);
  } else if (imgModel === 'nano-banana-pro') {
    imgModel = 'gemini-3-pro-image';
    Storage.setSetting('imageModel', imgModel);
  }
  if (imgSel) imgSel.value = imgModel;
}

function setupSettings() {
  document.getElementById('btn-back-settings').addEventListener('click', () => showScreen('home'));

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const key        = document.getElementById('input-api-key').value.trim();
    const model      = document.getElementById('select-model').value;
    const imageModel = document.getElementById('select-image-model')?.value;
    Storage.setSetting('apiKey', key);
    Storage.setSetting('model', model);
    if (imageModel) Storage.setSetting('imageModel', imageModel);
    const notice = document.getElementById('api-key-notice');
    if (key) notice.classList.add('hidden'); else notice.classList.remove('hidden');
    showToast('Settings saved ✓', 'success');
    showScreen('home');
  });

  document.getElementById('btn-validate-key').addEventListener('click', async () => {
    const key = document.getElementById('input-api-key').value.trim();
    if (!key) { showToast('Enter an API key first', 'error'); return; }
    Storage.setSetting('apiKey', key);
    const status = document.getElementById('validate-status');
    status.textContent = 'Testing…'; status.className = 'validate-status';
    const result = await GeminiAPI.validateKey();
    status.textContent = result.message;
    status.className   = 'validate-status ' + (result.ok ? 'ok' : 'err');
  });

  document.getElementById('btn-test-image')?.addEventListener('click', async () => {
    const key      = document.getElementById('input-api-key').value.trim();
    const imgModel = document.getElementById('select-image-model')?.value;
    if (!key) { showToast('Enter an API key first', 'error'); return; }
    Storage.setSetting('apiKey', key);
    if (imgModel) Storage.setSetting('imageModel', imgModel);

    const status  = document.getElementById('image-test-status');
    const preview = document.getElementById('image-test-preview');
    const img     = document.getElementById('image-test-img');
    status.textContent = '⏳ Generating…'; status.className = 'validate-status';
    preview.style.display = 'none';

    const testPrompt =
      '16:9 landscape environment concept art for a video game. ' +
      'A dramatic fantasy castle hall — wide establishing shot showing stone pillars, ' +
      'torchlit arched ceiling, a long corridor receding into shadow, ancient tapestries on the walls. ' +
      'Cinematic, painterly, atmospheric, full scene. NO icons, NO text, NO single objects.';

    const dataUrl = await GeminiAPI.generateImage(testPrompt);
    if (dataUrl) {
      img.src = dataUrl;
      preview.style.display = 'block';
      status.textContent = '✓ Image works!'; status.className = 'validate-status ok';
    } else {
      status.textContent = '✗ Failed — open F12 console for details';
      status.className = 'validate-status err';
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════
   ADVENTURES LIST SCREEN
   ════════════════════════════════════════════════════════════════════════ */

async function loadAdventuresList() {
  const grid = document.getElementById('adventures-grid');
  grid.innerHTML = '<div class="no-adventures"><span class="emoji">⏳</span><p>Loading adventures…</p></div>';

  const adventures = await Storage.listAdventures().catch(() => []);
  adventures.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!adventures.length) {
    grid.innerHTML = `
      <div class="no-adventures">
        <span class="emoji">📖</span>
        <p>No adventures yet.<br>Create one to begin your journey!</p>
      </div>`;
    return;
  }

  grid.innerHTML = adventures.map(adv => {
    const firstLoc = adv.locations?.[0];
    const thumbHtml = firstLoc?.image
      ? `<img src="${firstLoc.image}" class="adv-card-thumb" alt="${adv.title}">`
      : `<div class="adv-card-thumb-placeholder">${ROLE_EMOJI.starting}</div>`;
    const tags = (adv.styles || []).map(s => `<span class="adv-tag">${s}</span>`).join('');
    const date = new Date(adv.createdAt).toLocaleDateString();

    return `
      <div class="glass adv-card" data-id="${adv.id}">
        ${thumbHtml}
        <div class="adv-card-body">
          <div class="adv-card-title">${adv.title}</div>
          <div class="adv-card-desc">${adv.description || adv.goal || ''}</div>
          <div class="adv-card-meta">${tags}<span class="adv-tag">${adv.locations?.length || 0} locations</span><span class="adv-tag">${date}</span></div>
        </div>
        <div class="adv-card-actions">
          <button class="btn btn-primary" style="flex:1" data-action="play" data-id="${adv.id}">▶ Play</button>
          <button class="btn btn-danger btn-icon" data-action="delete" data-id="${adv.id}" title="Delete">🗑</button>
        </div>
      </div>`;
  }).join('');

  // Event delegation
  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'play')   await startGame(id);
    if (action === 'delete') await deleteAdventure(id);
  });
}

async function deleteAdventure(id) {
  if (!confirm('Delete this adventure? This cannot be undone.')) return;
  await Storage.deleteAdventure(id).catch(() => {});
  showToast('Adventure deleted', 'info');
  loadAdventuresList();
}

function setupAdventuresList() {
  document.getElementById('btn-back-adventures').addEventListener('click', () => showScreen('home'));
}

/* ════════════════════════════════════════════════════════════════════════
   GENERATE SCREEN
   ════════════════════════════════════════════════════════════════════════ */

let generatedAdventure = null;
let previewMapRenderer = null;

function setupGenerate() {
  document.getElementById('btn-back-generate').addEventListener('click', () => showScreen('home'));

  // Style chips
  const chips = document.querySelectorAll('#screen-generate .chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });

  document.getElementById('btn-generate').addEventListener('click', runGenerationStage1);
  document.getElementById('btn-regenerate-layout').addEventListener('click', runGenerationStage1);
  document.getElementById('btn-regenerate-groups')?.addEventListener('click', runGenerationStage1);
  document.getElementById('btn-approve-layout').addEventListener('click', runGenerationStage2);
  document.getElementById('btn-approve-groups')?.addEventListener('click', runGenerationStage3);
  document.getElementById('btn-approve-verticality')?.addEventListener('click', runGenerationStage4);
  document.getElementById('btn-approve-puzzles')?.addEventListener('click', runGenerationStage5);
  document.getElementById('btn-approve-flavor').addEventListener('click', runGenerationStage6);
  document.getElementById('btn-approve-text').addEventListener('click', runGenerationStage7);
  document.getElementById('btn-save-adventure').addEventListener('click', saveGeneratedAdventure);
}

let currentGenerator = null;
let currentGenConfig = null;

async function runGenerationStage1() {
  const descEl       = document.getElementById('gen-desc');
  let desc           = descEl ? descEl.value.trim() : '';
  const numDoors     = parseInt(document.getElementById('gen-num-doors').value, 10);
  const difficulty   = document.getElementById('gen-difficulty').value;
  const styles       = [...document.querySelectorAll('#screen-generate .chip.active')]
                         .map(c => c.textContent.trim());

  if (!desc) desc = 'Escape from a haunted castle';
  if (!Storage.getSetting('apiKey', '')) {
    showToast('No API key set — please go to Settings', 'error'); return;
  }

  currentGenConfig = { desc, description: desc, styles, numDoors, difficulty };

  // UI Setup
  const emptyEl = document.getElementById('gen-preview-empty');
  if (emptyEl) emptyEl.style.display = 'none';
  const previewSection = document.getElementById('gen-preview-section');
  previewSection.classList.add('visible');

  // Show map container for Stage 1
  document.getElementById('gen-map-container').style.display = 'block';

  document.getElementById('gen-stage-1').style.display = 'block';
  document.getElementById('gen-stage-2').style.display = 'none';
  document.getElementById('gen-stage-3').style.display = 'none';
  document.getElementById('gen-stage-4').style.display = 'none';
  document.getElementById('gen-stage-5').style.display = 'none';
  document.getElementById('gen-stage-6').style.display = 'none';
  
  // Progress
  const progressSection  = document.getElementById('gen-progress');
  const progressFill     = document.getElementById('gen-progress-fill');
  const progressText     = document.getElementById('gen-progress-text');
  progressSection.classList.add('visible');
  
  const generateBtn = document.getElementById('btn-generate');
  generateBtn.disabled = true;

  currentGenerator = new AdventureGenerator(GeminiAPI);
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '20%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generateTopology(currentGenConfig);
    generatedAdventure = adventure;
    
    // Set title and goal
    document.getElementById('gen-adventure-title').textContent = adventure.title;
    document.getElementById('gen-goal-text').textContent = adventure.goal || '';

    // Render map
    if (!previewMapRenderer) previewMapRenderer = new MapRenderer('gen-map-container');
    previewMapRenderer.render(adventure);

    showToast(`World layout generated!`, 'success', 3000);
  } catch (err) {
    showToast('Generation failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    generateBtn.disabled = false;
  }
}

async function runGenerationStage2() {
  if (!generatedAdventure || !currentGenerator) return;
  const btn = document.getElementById('btn-approve-layout');
  btn.disabled = true;

  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');
  
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '40%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generateGroupThemes(generatedAdventure);
    generatedAdventure = adventure;

    // Render Group Themes in UI
    const container = document.getElementById('gen-groups-preview');
    
    // Map group IDs to their theme colors
    const groupBorders = {
      group_1: '#ec4899', // Pink
      group_2: '#3b82f6', // Blue
      group_3: '#22c55e'  // Green
    };
    const defaultBorder = '#a855f7'; // Purple

    let html = '';
    
    // Render Global Setting & Mission card
    if (adventure.setting || adventure.mission) {
      html += `
        <div style="padding: 14px; background: rgba(99,102,241,0.07); border-radius: var(--radius-sm); border: 1px solid var(--indigo); margin-bottom: 8px;">
          <strong style="color: var(--indigo); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Global Setting &amp; Mission</strong>
          ${adventure.setting ? `<p style="font-size: 0.95rem; color: var(--text-primary); font-weight: 500; margin: 0 0 6px 0;"><span style="color:var(--text-muted); font-weight: 400;">Setting:</span> ${adventure.setting}</p>` : ''}
          ${adventure.mission ? `<p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0;"><span style="color:var(--text-muted); font-weight: 400;">Mission:</span> ${adventure.mission}</p>` : ''}
        </div>
      `;
    }

    html += Object.entries(adventure.groups).map(([groupId, grp]) => {
      const borderCol = groupBorders[groupId] || defaultBorder;
      const displayId = groupId.replace('_', ' ').toUpperCase();
      return `
        <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border-left: 4px solid ${borderCol};">
          <strong style="color: ${borderCol}; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">${displayId}: ${grp.name}</strong>
          <p style="margin-top: 4px; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.4;">${grp.description}</p>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // Update goal text at the top
    if (adventure.goal) {
      document.getElementById('gen-goal-text').textContent = adventure.goal;
    }

    // Re-render map (which will read thematic group names)
    if (previewMapRenderer) {
      previewMapRenderer.render(adventure);
    }

    document.getElementById('gen-stage-1').style.display = 'none';
    document.getElementById('gen-stage-2').style.display = 'block';
    showToast(`Locational groups defined!`, 'success', 3000);
  } catch (err) {
    showToast('Generation failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function runGenerationStage3() {
  if (!generatedAdventure || !currentGenerator) return;
  const btn = document.getElementById('btn-approve-groups');
  btn.disabled = true;

  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');
  
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '45%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generateVerticality(generatedAdventure);
    generatedAdventure = adventure;

    // Render Verticality alignment in UI
    const container = document.getElementById('gen-verticality-preview');
    
    const directionColors = {
      up: '#3b82f6',   // Blue (sky/upwards)
      down: '#22c55e', // Green (earth/downwards)
      none: '#64748b'  // Slate (flat)
    };
    const directionLabels = {
      up: '▲ UPPER LEVEL (Towers, Rooftops, Upper Decks)',
      down: '▼ LOWER LEVEL (Dungeons, Caves, Cellars)',
      none: '▮ GROUND LEVEL (Main level, Gardens, Streets)'
    };

    container.innerHTML = Object.entries(adventure.verticality).map(([groupId, direction]) => {
      const groupTheme = adventure.groups[groupId];
      if (!groupTheme) return '';
      const color = directionColors[direction] || '#a855f7';
      const label = directionLabels[direction] || direction.toUpperCase();
      return `
        <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border-left: 4px solid ${color};">
          <strong style="color: ${color}; font-size: 0.85rem;">${groupTheme.name}</strong>
          <div style="margin-top: 4px; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Floor Alignment: ${label}</div>
          <p style="margin-top: 4px; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.4;">${groupTheme.description}</p>
        </div>
      `;
    }).join('') + `
      <div style="padding: 10px; background: rgba(99,102,241,0.07); border-radius: var(--radius-sm); border-left: 3px solid var(--indigo); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
        💡 <strong>Verticality Added:</strong> We analyzed the area settings, created vertical rooms (cellars/attics), and aligned cross-floor connections to use <strong>UP</strong> and <strong>DOWN</strong> stairs. Floors are displayed side-by-side on the map.
      </div>
    `;

    // Re-render map (which will read thematic group names, z coordinates and floor separation)
    if (previewMapRenderer) {
      previewMapRenderer.render(adventure);
    }

    document.getElementById('gen-stage-2').style.display = 'none';
    document.getElementById('gen-stage-3').style.display = 'block';
    showToast(`Vertical alignment defined!`, 'success', 3000);
  } catch (err) {
    showToast('Verticality failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function runGenerationStage4() {
  if (!generatedAdventure || !currentGenerator) return;
  const btn = document.getElementById('btn-approve-verticality');
  btn.disabled = true;

  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');
  
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '55%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generatePuzzles(generatedAdventure);
    generatedAdventure = adventure;

    // Render puzzle suggestions UI
    const container = document.getElementById('gen-puzzles-preview');
    const locks = adventure.lockAnalysis || [];
    const suggestions = adventure.puzzleSuggestions || {};

    const kindIcons = { item: '📦', knowledge: '🧠', npc: '🗣️', action: '⚡' };
    const kindLabels = { item: 'Item', knowledge: 'Knowledge', npc: 'NPC', action: 'Action' };

    const typeBadgeColors = {
      'Traditional Lock & Key': '#f59e0b',
      'Single Item Bypass':     '#10b981',
      'Information/Clues':      '#8b5cf6',
      'Multi-Key Combination':  '#ef4444',
      'Remote Action':          '#3b82f6',
      'NPC Interaction':        '#ec4899',
      'Hidden Entrance':        '#64748b'
    };

    if (locks.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-muted);">
          <span style="font-size: 2rem;">🔓</span>
          <p>No locked doors found in this adventure. Proceeding without puzzles.</p>
        </div>`;
    } else {
      container.innerHTML = locks.map(lock => {
        const lockSugs = suggestions[lock.lockIndex] || [];
        return `
          <div class="puzzle-lock-card">
            <div class="puzzle-lock-header">
              <div class="puzzle-lock-icon">🔒</div>
              <div class="puzzle-lock-info">
                <div class="puzzle-lock-title">Lock #${lock.lockIndex}</div>
                <div class="puzzle-lock-meta">
                  ${lock.fromRoom.name} → <span style="color:var(--indigo);">${lock.direction}</span> → ${lock.toRoom.name}
                  &nbsp;·&nbsp; ${lock.numKeys} key${lock.numKeys > 1 ? 's' : ''} required
                </div>
              </div>
            </div>
            <div class="puzzle-options">
              ${(() => {
                const sugs = Array.isArray(lockSugs) ? lockSugs : [];
                return sugs.map((sug, idx) => {
                  if (!sug) return '';
                  const type = sug.type || 'Puzzle Option';
                  const obstacle = sug.obstacle || '';
                  const badgeColor = typeBadgeColors[type] || '#a855f7';
                  
                  // Resilient keys processing
                  let keysHtml = '';
                  if (sug.keys) {
                    const keysArr = Array.isArray(sug.keys) ? sug.keys : [sug.keys];
                    keysHtml = keysArr.map(key => {
                      if (!key) return '';
                      const kind = (typeof key === 'object' && key.kind) ? key.kind : 'item';
                      const desc = (typeof key === 'object' && key.description) ? key.description : String(key);
                      return `
                        <div class="puzzle-key">
                          <span class="puzzle-key-kind">${kindIcons[kind] || '❓'} ${kindLabels[kind] || kind}</span>
                          <span class="puzzle-key-desc">${desc}</span>
                        </div>`;
                    }).join('');
                  }

                  return `
                    <label class="puzzle-option" data-lock="${lock.lockIndex}" data-idx="${idx}">
                      <input type="radio" name="puzzle-lock-${lock.lockIndex}" value="${idx}" ${idx === 0 ? 'checked' : ''}>
                      <div class="puzzle-option-content">
                        <div class="puzzle-option-header">
                          <span class="puzzle-type-badge" style="--badge-color: ${badgeColor};">${type}</span>
                        </div>
                        <div class="puzzle-obstacle">
                          <span style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em;">Obstacle:</span>
                          ${obstacle}
                        </div>
                        <div class="puzzle-keys">
                          ${keysHtml}
                        </div>
                      </div>
                    </label>`;
                }).join('');
              })()}
            </div>
          </div>`;
      }).join('');
    }

    // Show map alongside puzzles
    document.getElementById('gen-map-container').style.display = 'block';

    document.getElementById('gen-stage-3').style.display = 'none';
    document.getElementById('gen-stage-4').style.display = 'block';
    showToast(`Puzzle suggestions generated!`, 'success', 3000);
  } catch (err) {
    showToast('Puzzle generation failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function runGenerationStage5() {
  if (!generatedAdventure || !currentGenerator) return;
  const btn = document.getElementById('btn-approve-puzzles');
  btn.disabled = true;

  // Collect selected puzzles before proceeding
  const selectedPuzzles = {};
  const locks = generatedAdventure.lockAnalysis || [];
  const suggestions = generatedAdventure.puzzleSuggestions || {};
  for (const lock of locks) {
    const radios = document.querySelectorAll(`input[name="puzzle-lock-${lock.lockIndex}"]`);
    let selectedIdx = 0;
    radios.forEach(r => { if (r.checked) selectedIdx = parseInt(r.value); });
    const chosen = (suggestions[lock.lockIndex] || [])[selectedIdx];
    if (chosen) selectedPuzzles[lock.lockIndex] = chosen;
  }
  generatedAdventure.selectedPuzzles = selectedPuzzles;

  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');
  
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '65%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generateFlavor(generatedAdventure);
    generatedAdventure = adventure;
    
    // Set title and goal
    document.getElementById('gen-adventure-title').textContent = adventure.title;
    document.getElementById('gen-goal-text').textContent = adventure.goal || '';

    // Re-render map with flavor names
    if (previewMapRenderer) {
      previewMapRenderer.render(adventure);
    }

    document.getElementById('gen-stage-4').style.display = 'none';
    document.getElementById('gen-stage-5').style.display = 'block';
    showToast(`Thematic flavor applied!`, 'success', 3000);
  } catch (err) {
    showToast('Flavor generation failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function runGenerationStage6() {
  if (!generatedAdventure || !currentGenerator) return;
  const btn = document.getElementById('btn-approve-flavor');
  btn.disabled = true;

  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');
  
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '80%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generateDetails(generatedAdventure);
    generatedAdventure = adventure;
    
    // Render text summary
    const container = document.getElementById('gen-text-preview');
    container.innerHTML = adventure.locations.map(loc => `
      <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: var(--radius-sm);">
        <strong style="color: var(--text-primary);">${loc.name} (Floor: ${loc.z || 0})</strong>
        <p style="margin-top: 4px; font-size: 0.9rem; color: var(--text-secondary);">${loc.fullDescription || loc.shortDescription}</p>
        ${Object.keys(loc.stateDescriptions || {}).length ? `<div style="margin-top:4px; font-size: 0.8rem; color: var(--indigo);">+ Alternate states</div>` : ''}
      </div>
    `).join('');

    // Hide map for text preview stage
    document.getElementById('gen-map-container').style.display = 'none';

    document.getElementById('gen-stage-5').style.display = 'none';
    document.getElementById('gen-stage-6').style.display = 'block';
    showToast(`Text descriptions generated!`, 'success', 3000);
  } catch (err) {
    showToast('Text generation failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function runGenerationStage7() {
  if (!generatedAdventure || !currentGenerator) return;
  const btn = document.getElementById('btn-approve-text');
  btn.disabled = true;

  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');
  
  currentGenerator.onProgress = (done, total, message) => {
    progressFill.style.width = '100%';
    progressText.textContent = message;
  };

  try {
    const adventure = await currentGenerator.generateImages(generatedAdventure);
    generatedAdventure = adventure;
    
    // Render location cards
    const grid = document.getElementById('gen-location-cards');
    grid.innerHTML = adventure.locations.map(loc => `
      <div class="loc-preview-card">
        ${loc.image
          ? `<img src="${loc.image}" class="loc-preview-img" alt="${loc.name}">`
          : `<div class="loc-preview-placeholder" style="background:${ROLE_GRADIENTS[loc.role]||'linear-gradient(135deg,#1e1e3f,#2d2d6b)'}">${ROLE_EMOJI[loc.role]||'🏛'}</div>`
        }
        <div class="loc-preview-body">
          <div class="loc-preview-role">${loc.role}</div>
          <div class="loc-preview-name">${loc.name}</div>
        </div>
      </div>
    `).join('');

    // Hide map for final artwork stage
    document.getElementById('gen-map-container').style.display = 'none';

    document.getElementById('gen-stage-6').style.display = 'none';
    document.getElementById('gen-stage-7').style.display = 'block';
    showToast(`Images generated! Ready to play!`, 'success', 3000);
  } catch (err) {
    showToast('Image generation failed: ' + err.message, 'error', 6000);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function saveGeneratedAdventure() {
  if (!generatedAdventure) return;
  try {
    await Storage.saveAdventure(generatedAdventure);
    showToast('Adventure saved! Starting game…', 'success');
    setTimeout(() => startGame(generatedAdventure.id), 1200);
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PLAY SCREEN
   ════════════════════════════════════════════════════════════════════════ */

let engine   = null;
let gameChat = null;
let isThinking = false;

async function startGame(adventureId) {
  const adventure = await Storage.loadAdventure(adventureId);
  if (!adventure) { showToast('Adventure not found', 'error'); return; }

  const savedState = await Storage.loadGameState(adventureId).catch(() => null);
  // If the saved state was a completed (won/lost) run, or corrupted, discard it so we get a fresh start
  const validState = (savedState && !savedState.isWon && !savedState.isLost && savedState.currentLocation) ? savedState : null;

  // Init engine
  engine   = new GameEngine();
  gameChat = new GameChat(engine, GeminiAPI);

  const state = engine.init(adventure, validState);

  // Switch screen
  showScreen('play');

  // Set title
  document.getElementById('play-title').textContent = adventure.title;

  // Reset chat
  document.getElementById('chat-messages').innerHTML = '';

  // Render current location UI
  renderLocation();
  renderSidebar();

  // Show introduction then auto-look
  if (!savedState) {
    addChatMessage('system', `📖 ${adventure.introduction}`);
    addChatMessage('system', `🎯 Goal: ${adventure.goal}`);
  }

  // Auto-look at start
  await sendGameMessage('look around');
}

function renderLocation() {
  if (!engine) return;
  const loc  = engine.getCurrentLocation();
  const desc = engine.getLocationDescription(engine.gameState.currentLocation);

  // Image
  const imgContainer = document.getElementById('location-image-container');
  imgContainer.innerHTML = loc.image
    ? `<img src="${loc.image}" class="location-image" alt="${loc.name}">`
    : `<div class="location-image-placeholder" style="background:${ROLE_GRADIENTS[loc.role]||'linear-gradient(135deg,#1e1e3f,#2d2d6b)'}; width:100%; height:100%">${ROLE_EMOJI[loc.role]||'🏛'}</div>`;
  imgContainer.innerHTML += '<div class="location-image-overlay"></div>';
  imgContainer.innerHTML += `<div class="location-name-badge">${loc.name}</div>`;

  // Description
  document.getElementById('location-desc-text').textContent = desc;

  // Movement update
  const exits = loc.exits || {};
  const lockedExits = loc.lockedExits || {};
  const locSt = engine.gameState.locationStates[loc.id] || {};

  document.querySelectorAll('.compass-btn').forEach(btn => {
    const dir = btn.dataset.dir;
    btn.disabled = !exits[dir];
    btn.classList.remove('open', 'blocked');
    
    if (exits[dir]) {
      const lockRule = lockedExits[dir];
      if (lockRule && String(locSt[lockRule.stateKey]) !== String(lockRule.stateValue)) {
        btn.classList.add('blocked');
      } else {
        btn.classList.add('open');
      }
    }
  });
}

function renderSidebar() {
  if (!engine) return;
  const gs = engine.gameState;

  // Health
  const hp    = gs.player.health;
  const maxHp = gs.player.maxHealth;
  const pct   = Math.round((hp / maxHp) * 100);
  document.getElementById('health-value').textContent = `${hp} / ${maxHp}`;
  const fill = document.getElementById('health-fill');
  fill.style.width = pct + '%';
  fill.className = 'health-fill ' + (pct > 60 ? 'high' : pct > 30 ? 'medium' : 'low');

  // Inventory
  const invList = document.getElementById('inventory-list');
  if (!gs.inventory.length) {
    invList.innerHTML = '<div class="inv-empty">Nothing yet…</div>';
  } else {
    invList.innerHTML = gs.inventory.map(itemId => {
      const item = engine.getItem(itemId);
      const thumbHTML = item?.image 
        ? `<img src="${item.image}" class="inv-item-thumb" alt="${item?.name || itemId}">` 
        : `<span class="inv-item-icon">${item?.usable ? '⚗️' : '📦'}</span>`;
      return `<div class="inv-item" data-item-name="${item?.name || itemId}">
        ${thumbHTML}
        <span>${item?.name || itemId}</span>
      </div>`;
    }).join('');
  }
}

/* ── Chat helpers ─────────────────────────────────────────────────────── */

function addChatMessage(type, text) {
  const chatEl = document.getElementById('chat-messages');
  const div    = document.createElement('div');
  div.className = `chat-msg chat-msg-${type}`;
  div.innerHTML = `<div class="msg-bubble">${text}</div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function showTypingIndicator() {
  const chatEl = document.getElementById('chat-messages');
  const div    = document.createElement('div');
  div.className = 'chat-msg typing-indicator';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

async function sendGameMessage(input) {
  if (!engine || !gameChat || isThinking) return;
  const trimmed = input.trim();
  if (!trimmed) return;

  isThinking = true;
  document.getElementById('btn-send').disabled = true;
  document.getElementById('chat-input').disabled = true;

  // Show player message (not for auto-look)
  if (trimmed !== 'look around' || document.getElementById('chat-messages').children.length > 2) {
    addChatMessage('player', trimmed);
  }

  showTypingIndicator();

  try {
    const result = await gameChat.sendMessage(trimmed);
    removeTypingIndicator();

    // Show narration
    addChatMessage('narrator', result.narration);

    // Apply action to engine
    engine.applyAction(result);

    // Render updated state
    renderLocation();
    renderSidebar();

    // Win/Lose check
    if (engine.gameState.isWon) {
      document.getElementById('overlay-win').classList.add('visible');
    } else if (engine.gameState.isLost) {
      document.getElementById('overlay-lose').classList.add('visible');
    }

    // Auto-save
    await Storage.saveGameState(engine.adventure.id, engine.toSaveData()).catch(() => {});

  } catch (err) {
    removeTypingIndicator();
    addChatMessage('error', `⚠ ${err.message}`);
  } finally {
    isThinking = false;
    document.getElementById('btn-send').disabled  = false;
    document.getElementById('chat-input').disabled = false;
    document.getElementById('chat-input').focus();
  }
}

function setupPlay() {
  // Send on button click
  document.getElementById('btn-send').addEventListener('click', () => {
    const input = document.getElementById('chat-input');
    sendGameMessage(input.value);
    input.value = '';
  });

  // Inventory click to chat
  document.getElementById('inventory-list').addEventListener('click', (e) => {
    const itemEl = e.target.closest('.inv-item');
    if (!itemEl) return;
    const name = itemEl.dataset.itemName;
    if (!name) return;
    const input = document.getElementById('chat-input');
    input.value = (input.value ? input.value + ' ' : '') + name + ' ';
    input.focus();
  });

  // Movement buttons
  document.querySelectorAll('.compass-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir;
      if (dir && !btn.disabled) {
        sendGameMessage(`go ${dir}`);
      }
    });
  });

  // Send on Enter
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      sendGameMessage(input.value);
      input.value = '';
    }
  });

  // Top bar
  document.getElementById('btn-play-save').addEventListener('click', async () => {
    if (!engine) return;
    await Storage.saveGameState(engine.adventure.id, engine.toSaveData()).catch(() => {});
    showToast('Game saved ✓', 'success');
  });

  document.getElementById('btn-play-menu').addEventListener('click', () => {
    showScreen('adventures');
    loadAdventuresList();
  });

  // Win overlay
  document.getElementById('btn-win-menu').addEventListener('click', () => {
    showScreen('adventures'); loadAdventuresList();
  });
  document.getElementById('btn-win-restart').addEventListener('click', async () => {
    document.getElementById('overlay-win').classList.remove('visible');
    if (engine) {
      // Clear saved state so it starts fresh, not from the won position
      const advId = engine.adventure.id;
      await Storage.saveGameState(advId, null).catch(() => {});
      engine = null; gameChat = null;
      await startGame(advId);
    }
  });

  // Lose overlay
  document.getElementById('btn-lose-restart').addEventListener('click', async () => {
    document.getElementById('overlay-lose').classList.remove('visible');
    if (engine) {
      const advId = engine.adventure.id;
      // Clear saved state for a true fresh start
      await Storage.saveGameState(advId, null).catch(() => {});
      engine = null; gameChat = null;
      await startGame(advId);
    }
  });
  document.getElementById('btn-lose-menu').addEventListener('click', () => {
    showScreen('adventures'); loadAdventuresList();
  });
}

/* ════════════════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════════════════ */

async function boot() {
  // Init storage
  await Storage.init();

  // Particle background
  initParticles();

  // Wire up all screens
  setupHome();
  setupSettings();
  setupAdventuresList();
  setupGenerate();
  setupPlay();

  // Start on home
  showScreen('home');
}

document.addEventListener('DOMContentLoaded', boot);
