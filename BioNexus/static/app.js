/**
 * BioNexus v2.0 — Frontend Application Logic
 * All API calls go through /api/* backend routes.
 * No API keys are stored or used here.
 */

'use strict';

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const BN = {
  lastResults: [],
  lastQuery: '',
  lastTool: '',
  lastResultData: null,
  blastRid: null,
  blastPollTimer: null,
  clustalJobId: null,
  clustalPollTimer: null,
  phymlJobId: null,
  phymlPollTimer: null,
  stringData: null,
  igvBrowser: null,
  treeData: null,
  networkAnimFrame: null,
  isDark: true,
};

/* ═══════════════════════════════════════════
   NAVIGATION HISTORY
═══════════════════════════════════════════ */
const NAV = {
  stack: [],          // Array of { catId, toolId, label, icon }
  current: null,      // Current state
  maxHistory: 30,

  // Human-friendly label map
  labels: {
    dashboard:       { label: 'Dashboard',           icon: '🏠' },
    databases:       { label: 'Primary Databases',   icon: '🗄️' },
    alignment:       { label: 'Sequence Alignment',  icon: '🧬' },
    ngs:             { label: 'NGS Analysis',        icon: '🔬' },
    transcriptomics: { label: 'Transcriptomics',     icon: '📊' },
    proteomics:      { label: 'Proteomics & Struct', icon: '🔷' },
    networks:        { label: 'Networks & Interact', icon: '🕸️' },
    pathways:        { label: 'Pathways & Systems',  icon: '🛤️' },
    packages:        { label: 'Packages & Software', icon: '📦' },
    settings:        { label: 'Settings',            icon: '⚙️' },
    // tool tabs
    ncbi:    { label: 'NCBI',         icon: '🔍' },
    ebi:     { label: 'EMBL-EBI',     icon: '🔬' },
    ddbj:    { label: 'DDBJ',         icon: '🧬' },
    ucsc:    { label: 'UCSC Browser', icon: '🧬' },
    blast:   { label: 'BLAST',        icon: '💥' },
    clustal: { label: 'Clustal Omega',icon: '🔗' },
    pairwise:{ label: 'Pairwise',     icon: '↔️' },
    fastqc:  { label: 'FastQC',       icon: '📈' },
    gatk:    { label: 'GATK',         icon: '🔭' },
    igv:     { label: 'IGV Browser',  icon: '🧩' },
    hisat:   { label: 'HISAT2',       icon: '↪️' },
    deseq:   { label: 'DESeq2',       icon: '📉' },
    edger:   { label: 'edgeR',        icon: '📊' },
    uniprot: { label: 'UniProt',      icon: '🔑' },
    pdb:     { label: 'PDB',          icon: '🏗️' },
    alphafold:{ label:'AlphaFold',    icon: '🤖' },
    string:  { label: 'STRING',       icon: '🕸️' },
    kegg:    { label: 'KEGG',         icon: '🛤️' },
    reactome:{ label: 'Reactome',     icon: '⚗️' },
    galaxy:  { label: 'Galaxy',       icon: '🌌' },
    bioconductor: { label: 'Bioconductor', icon: '📦' },
    bioconda:{ label: 'Bioconda',     icon: '🐍' },
  },
};

/* Push current location to history stack */
function pushNav(catId, toolId, skipIfSame) {
  const state = { catId, toolId: toolId || null };
  // Don't push duplicate
  if (skipIfSame && NAV.current &&
      NAV.current.catId === catId &&
      NAV.current.toolId === toolId) return;

  if (NAV.current) {
    NAV.stack.push({ ...NAV.current });
    if (NAV.stack.length > NAV.maxHistory) NAV.stack.shift();
  }
  NAV.current = state;
  updateBackUI();
}

/* Go back to previous navigation state */
function navigateBack() {
  if (!NAV.stack.length) return;
  const prev = NAV.stack.pop();
  NAV.current = NAV.stack.length ? NAV.stack[NAV.stack.length - 1] : null;

  // Restore the panel silently (don't re-push to stack)
  _gotoState(prev);
  if (NAV.stack.length > 0) {
    NAV.current = NAV.stack[NAV.stack.length - 1];
  } else {
    NAV.current = prev;
  }
  updateBackUI();
}

/* Restore a state without touching the stack */
function _gotoState(state) {
  if (!state) return;
  const { catId, toolId } = state;
  // Activate panel
  document.querySelectorAll('.cat-panel').forEach(p =>
    p.classList.toggle('active', p.id === `panel-${catId}`));
  scrollToApp();
  // Activate tool tab if specified
  if (toolId) {
    const panel = document.getElementById(`panel-${catId}`);
    if (panel) {
      panel.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`tool-${catId}-${toolId}`);
      if (target) target.classList.add('active');
      const tabBtn = panel.querySelector(`[onclick*="'${toolId}'"]`);
      if (tabBtn) tabBtn.classList.add('active');
    }
  }
  // Sync sidebar button
  document.querySelectorAll('.sb-tool-btn').forEach(b => b.classList.remove('active'));
  if (toolId) {
    const sbBtn = document.getElementById(`sb-${catId}-${toolId}`);
    if (sbBtn) sbBtn.classList.add('active');
  }
}

/* Update the back button + breadcrumb display */
function updateBackUI() {
  const wrap    = document.getElementById('navBackWrap');
  const crumb   = document.getElementById('navBreadcrumb');
  if (!wrap) return;

  const hasHistory = NAV.stack.length > 0;
  wrap.classList.toggle('visible', hasHistory);

  if (!crumb) return;
  crumb.innerHTML = '';

  // Build breadcrumb from up to 3 history items + current
  const trail = [...NAV.stack.slice(-2), NAV.current].filter(Boolean);
  trail.forEach((s, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'nbc-sep'; sep.textContent = '›';
      crumb.appendChild(sep);
    }
    const info = NAV.labels[s.toolId] || NAV.labels[s.catId] || { label: s.toolId || s.catId, icon: '📄' };
    const item = document.createElement('span');
    item.className = 'nbc-item' + (i === trail.length - 1 ? ' nbc-current' : '');
    item.textContent = info.label;
    item.title = info.label;
    if (i < trail.length - 1) {
      const snap = { ...s };
      item.onclick = () => { _gotoState(snap); };
    }
    crumb.appendChild(item);
  });
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initBgCanvas();
  initHeroCanvas();
  initNavSearch();
  initScrollReveal();
  loadSavedTheme();
  checkApiStatus();
  initDrawer();
  openCategory('dashboard');
  initDashboardAnimations();

  // Keyboard shortcut: Alt+← for back
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateBack();
    }
  });
  // Mouse button 4 (browser back button on mouse)
  document.addEventListener('mouseup', e => {
    if (e.button === 3) { e.preventDefault(); navigateBack(); }
  });
});

/* ═══════════════════════════════════════════
   DASHBOARD ANIMATIONS — Cycling text & counters
═══════════════════════════════════════════ */
function initDashboardAnimations() {
  // Cycling subtitle text
  const cycleEl = document.getElementById('dashCycleText');
  if (cycleEl) {
    const phrases = [
      'NCBI databases',
      'EMBL-EBI resources',
      'BLAST alignment',
      'UniProt proteins',
      'KEGG pathways',
      'PDB structures',
      'AlphaFold predictions',
      'Reactome reactions',
      'STRING networks',
      'phylogenetic trees',
    ];
    let idx = 0;
    setInterval(() => {
      cycleEl.style.opacity = '0';
      setTimeout(() => {
        idx = (idx + 1) % phrases.length;
        cycleEl.textContent = phrases[idx];
        cycleEl.style.opacity = '1';
      }, 320);
    }, 2800);
  }

  // Animate number counters
  document.querySelectorAll('.dps-num[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    let current = 0;
    const duration = 1400;
    const steps = 40;
    const increment = target / steps;
    const delay = 900; // wait for page load animation
    setTimeout(() => {
      const timer = setInterval(() => {
        current = Math.min(current + increment, target);
        el.textContent = Math.round(current);
        if (current >= target) clearInterval(timer);
      }, duration / steps);
    }, delay);
  });
}



/* ═══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function loadSavedTheme() {
  const saved = localStorage.getItem('bionexus-theme') || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.body.classList.contains('theme-light') ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  // Ripple flash on toggle
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.style.transform = 'scale(0.9)';
    setTimeout(() => btn.style.transform = '', 150);
  }
}

function applyTheme(theme) {
  BN.isDark = theme === 'dark';
  document.body.classList.toggle('theme-light', theme === 'light');
  localStorage.setItem('bionexus-theme', theme);
  // Sync settings modal buttons
  document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.classList.toggle('active', opt.id === `t-${theme}`);
  });
  showToast(`${theme === 'dark' ? '🌙 Dark' : '☀️ Light'} mode`, 'info');
}

/* ═══════════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════════ */
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ═══════════════════════════════════════════
   DRAWER — OPEN / CLOSE / TOGGLE
═══════════════════════════════════════════ */
function initDrawer() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDrawer(); hideDashSearch(); }
  });
  document.addEventListener('click', e => {
    const dd = document.getElementById('navSearchDropdown');
    const input = document.getElementById('globalSearchNav');
    if (dd && !dd.contains(e.target) && e.target !== input) dd.classList.remove('open');
  });
}
function toggleDrawer() {
  const d = document.getElementById('sideDrawer');
  if (d.classList.contains('open')) closeDrawer(); else openDrawer();
}
function openDrawer() {
  document.getElementById('sideDrawer').classList.add('open');
  document.getElementById('drawerBackdrop').classList.add('open');
  document.getElementById('hamburgerBtn').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('sideDrawer')?.classList.remove('open');
  document.getElementById('drawerBackdrop')?.classList.remove('open');
  document.getElementById('hamburgerBtn')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* Toggle the two accordion groups (Databases / Tools) */
function toggleDnavGroup(groupId) {
  const group = document.getElementById(`dng-${groupId}`);
  if (!group) return;
  const isOpen = group.classList.contains('open');
  document.querySelectorAll('.dnav-group.open').forEach(g => g.classList.remove('open'));
  if (!isOpen) group.classList.add('open');
}

/* Open tool from drawer — master navigation function */
function openToolFromDrawer(catId, toolId) {
  closeDrawer();
  if (catId === 'dashboard') { pushNav('dashboard', null, true); openCategory('dashboard'); return; }
  if (catId === 'ai')        { openCategory('ai'); return; }
  pushNav(catId, toolId || null, true);
  // Activate panel
  document.querySelectorAll('.cat-panel').forEach(panel =>
    panel.classList.toggle('active', panel.id === `panel-${catId}`));
  if (toolId) {
    const panel = document.getElementById(`panel-${catId}`);
    if (panel) {
      panel.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`tool-${catId}-${toolId}`);
      if (target) target.classList.add('active');
      const tabBtn = panel.querySelector(`[onclick*="'${toolId}'"]`);
      if (tabBtn) tabBtn.classList.add('active');
    }
    if (catId === 'ngs') setTimeout(initIGV, 400);
  }
  scrollToApp();
}

/* ═══════════════════════════════════════════
   ALL PLATFORM ITEMS (for search)
═══════════════════════════════════════════ */
const ALL_ITEMS = [
  {icon:'🌐',name:'NCBI',sub:'National Center for Biotechnology Information',type:'db',cat:'databases',tool:'ncbi'},
  {icon:'🧬',name:'EMBL-EBI',sub:'European Bioinformatics Institute',type:'db',cat:'databases',tool:'ebi'},
  {icon:'🗄️',name:'DDBJ',sub:'DNA Data Bank of Japan',type:'db',cat:'databases',tool:'ddbj'},
  {icon:'🔭',name:'UCSC Genome Browser',sub:'Genome browser by UC Santa Cruz',type:'db',cat:'databases',tool:'ucsc'},
  {icon:'🧬',name:'UniProt',sub:'Universal Protein Resource',type:'db',cat:'proteomics',tool:'uniprot'},
  {icon:'🔬',name:'RCSB PDB',sub:'Protein Data Bank — 3D structures',type:'db',cat:'proteomics',tool:'pdb'},
  {icon:'🤖',name:'AlphaFold Database',sub:'AI-predicted protein structures',type:'db',cat:'proteomics',tool:'alphafold'},
  {icon:'🕸️',name:'STRING',sub:'Protein interaction networks',type:'db',cat:'proteomics',tool:'string'},
  {icon:'🗺️',name:'KEGG',sub:'Kyoto Encyclopedia of Genes and Genomes',type:'db',cat:'pathways',tool:'kegg'},
  {icon:'⚗️',name:'Reactome',sub:'Biological pathway database',type:'db',cat:'pathways',tool:'reactome'},
  {icon:'🔍',name:'BLAST',sub:'Basic Local Alignment Search Tool',type:'sw',cat:'alignment',tool:'blast'},
  {icon:'🧩',name:'Clustal Omega',sub:'Multiple sequence alignment',type:'sw',cat:'alignment',tool:'clustal'},
  {icon:'🗺️',name:'Bowtie2 / BWA',sub:'Short-read mapping to reference genome',type:'sw',cat:'alignment',tool:'bowtie'},
  {icon:'📍',name:'Minimap2',sub:'Long-read alignment tool',type:'sw',cat:'alignment',tool:'minimap'},
  {icon:'⚖️',name:'Pairwise Aligner',sub:'Needleman-Wunsch & Smith-Waterman',type:'sw',cat:'alignment',tool:'pairwise'},
  {icon:'🔬',name:'FastQC',sub:'Quality control for sequencing reads',type:'sw',cat:'ngs',tool:'fastqc'},
  {icon:'🎯',name:'GATK',sub:'Genome Analysis Toolkit — variant calling',type:'sw',cat:'ngs',tool:'gatk'},
  {icon:'🤖',name:'DeepVariant',sub:'Deep learning variant caller by Google',type:'sw',cat:'ngs',tool:'deepvariant'},
  {icon:'🔧',name:'Samtools / bedtools',sub:'BAM/BED file manipulation',type:'sw',cat:'ngs',tool:'samtools'},
  {icon:'🖥️',name:'IGV Genome Viewer',sub:'Interactive genome visualization',type:'sw',cat:'ngs',tool:'igv'},
  {icon:'🗺️',name:'HISAT2 / STAR',sub:'RNA-Seq alignment tools',type:'sw',cat:'transcriptomics',tool:'hisat2'},
  {icon:'📈',name:'FeatureCounts / Salmon',sub:'Gene expression quantification',type:'sw',cat:'transcriptomics',tool:'featurecounts'},
  {icon:'📉',name:'DESeq2 / EdgeR',sub:'Differential expression analysis',type:'sw',cat:'transcriptomics',tool:'deseq2'},
  {icon:'🌲',name:'MEGA / Tree Builder',sub:'Phylogenetic tree construction (NJ)',type:'sw',cat:'phylogenetics',tool:'mega'},
  {icon:'🔬',name:'PhyML / RAxML',sub:'Maximum-likelihood phylogeny',type:'sw',cat:'phylogenetics',tool:'phyml'},
  {icon:'🕸️',name:'Cytoscape',sub:'Network visualization and analysis',type:'sw',cat:'pathways',tool:'cytoscape'},
  {icon:'🦠',name:'QIIME 2',sub:'Microbiome and metagenomics analysis',type:'sw',cat:'pathways',tool:'qiime'},
  {icon:'🌌',name:'Galaxy Platform',sub:'Web-based workflow execution',type:'sw',cat:'workflows',tool:'galaxy'},
  {icon:'🔄',name:'Nextflow / Snakemake',sub:'Pipeline management systems',type:'sw',cat:'workflows',tool:'nextflow'},
  {icon:'📦',name:'Bioconductor',sub:'R-based bioinformatics packages',type:'sw',cat:'workflows',tool:'bioconductor'},
  {icon:'🐍',name:'Bioconda',sub:'Conda channel for bioinformatics',type:'sw',cat:'workflows',tool:'bioconda'},
];

/* ═══════════════════════════════════════════
   NAVBAR SEARCH DROPDOWN
═══════════════════════════════════════════ */
function navSearchFilter(query) {
  const dd = document.getElementById('navSearchDropdown');
  if (!dd) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) { dd.classList.remove('open'); return; }
  const matches = ALL_ITEMS.filter(m => m.name.toLowerCase().includes(q) || m.sub.toLowerCase().includes(q)).slice(0, 9);
  if (!matches.length) {
    dd.innerHTML = `<div class="nsd-empty">No results for "<strong>${escHtml(query)}</strong>"</div>`;
    dd.classList.add('open'); return;
  }
  const dbs = matches.filter(m => m.type === 'db');
  const sws = matches.filter(m => m.type === 'sw');
  const ais = matches.filter(m => m.type === 'ai');
  const makeItem = m => `
    <div class="nsd-item" onclick="openToolFromDrawer('${m.cat}','${m.tool || ''}');
      document.getElementById('globalSearchNav').value='';
      document.getElementById('navSearchDropdown').classList.remove('open');">
      <span class="nsd-icon">${m.icon}</span>
      <span class="nsd-name">${escHtml(m.name)}</span>
      <span class="nsd-type ${m.type}">${m.type==='db'?'DB':m.type==='ai'?'AI':'SW'}</span>
    </div>`;
  let html = '';
  if (dbs.length) html += `<div class="nsd-section">Databases</div>` + dbs.map(makeItem).join('');
  if (sws.length) html += `<div class="nsd-section">Tools</div>` + sws.map(makeItem).join('');
  if (ais.length) html += ais.map(makeItem).join('');
  dd.innerHTML = html;
  dd.classList.add('open');
}
function showNavResults() {
  const v = document.getElementById('globalSearchNav')?.value;
  if (v?.trim()) navSearchFilter(v);
}

/* ═══════════════════════════════════════════
   DASHBOARD UNIVERSAL SEARCH
═══════════════════════════════════════════ */
function showDashSearch() {
  const box = document.getElementById('dashSearchBox');
  const btn = document.getElementById('dashLaunchBtn');
  if (box) box.classList.add('visible');
  if (btn) btn.style.display = 'none';
  setTimeout(() => document.getElementById('dashSearchInput')?.focus(), 100);
}
function hideDashSearch() {
  const box = document.getElementById('dashSearchBox');
  const btn = document.getElementById('dashLaunchBtn');
  if (box) box.classList.remove('visible');
  if (btn) btn.style.display = '';
  const res = document.getElementById('dashSearchResults');
  if (res) { res.innerHTML = ''; res.classList.remove('has-results'); }
  const inp = document.getElementById('dashSearchInput');
  if (inp) inp.value = '';
}
function dashUniversalSearch(query) {
  const res = document.getElementById('dashSearchResults');
  if (!res) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) { res.innerHTML = ''; res.classList.remove('has-results'); return; }
  const matches = ALL_ITEMS.filter(m => m.name.toLowerCase().includes(q) || m.sub.toLowerCase().includes(q));
  if (!matches.length) {
    res.innerHTML = `<div class="dsb-res-item" style="justify-content:center;color:var(--text-muted)">No results for "${escHtml(query)}"</div>`;
    res.classList.add('has-results'); return;
  }
  res.innerHTML = matches.slice(0, 10).map(m => `
    <div class="dsb-res-item" onclick="openToolFromDrawer('${m.cat}','${m.tool || ''}'); hideDashSearch()">
      <span class="dsb-res-icon">${m.icon}</span>
      <div style="flex:1;min-width:0">
        <div class="dsb-res-name">${escHtml(m.name)}</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${escHtml(m.sub)}</div>
      </div>
      <span class="dsb-res-type ${m.type}">${m.type==='db'?'DB':m.type==='ai'?'AI':'SW'}</span>
    </div>`).join('');
  res.classList.add('has-results');
}

/* ═══════════════════════════════════════════
   ANIMATED BACKGROUND
═══════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.r  = Math.random() * 2 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.a  = Math.random() * 0.5 + 0.1;
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100,255,218,${this.a})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    // Connect nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 120) {
          const alpha = (1 - dist/120) * 0.12;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(100,255,218,${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
}

/* ═══════════════════════════════════════════
   HERO DNA CANVAS
═══════════════════════════════════════════ */
function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let angle = 0;

  function drawDNA() {
    ctx.clearRect(0, 0, W, H);
    const cx = W/2, cy = H/2;
    const R = 120, nRung = 18, phase = angle;

    // Draw two strands
    for (let strand = 0; strand < 2; strand++) {
      const offset = strand === 0 ? 0 : Math.PI;
      ctx.beginPath();
      for (let i = 0; i <= nRung * 4; i++) {
        const t  = i / (nRung * 4);
        const a  = t * Math.PI * 4 + phase + offset;
        const x  = cx + Math.cos(a) * R;
        const y  = cy - H * 0.42 + t * H * 0.84;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      if (strand === 0) {
        grad.addColorStop(0, 'rgba(100,255,218,0.0)');
        grad.addColorStop(0.5, 'rgba(100,255,218,0.8)');
        grad.addColorStop(1, 'rgba(100,255,218,0.0)');
      } else {
        grad.addColorStop(0, 'rgba(199,125,255,0.0)');
        grad.addColorStop(0.5, 'rgba(199,125,255,0.8)');
        grad.addColorStop(1, 'rgba(199,125,255,0.0)');
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Rungs
    for (let i = 0; i < nRung; i++) {
      const t  = i / (nRung - 1);
      const a1 = t * Math.PI * 4 + phase;
      const a2 = a1 + Math.PI;
      const y  = cy - H * 0.42 + t * H * 0.84;
      const x1 = cx + Math.cos(a1) * R;
      const x2 = cx + Math.cos(a2) * R;
      const visible = (Math.cos(a1) + 1) / 2;

      const rGrad = ctx.createLinearGradient(x1, y, x2, y);
      rGrad.addColorStop(0,   `rgba(100,255,218,${visible * 0.7})`);
      rGrad.addColorStop(0.5, `rgba(200,255,240,${visible * 0.5})`);
      rGrad.addColorStop(1,   `rgba(199,125,255,${visible * 0.7})`);

      ctx.beginPath();
      ctx.moveTo(x1, y); ctx.lineTo(x2, y);
      ctx.strokeStyle = rGrad;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Base pair dots
      ctx.beginPath();
      ctx.arc(x1, y, 5, 0, Math.PI*2);
      ctx.fillStyle = `rgba(100,255,218,${visible * 0.9})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y, 5, 0, Math.PI*2);
      ctx.fillStyle = `rgba(199,125,255,${visible * 0.9})`;
      ctx.fill();
    }
    angle += 0.012;
    requestAnimationFrame(drawDNA);
  }
  drawDNA();
}

/* ═══════════════════════════════════════════
   TYPEWRITER
═══════════════════════════════════════════ */
function initTypewriter() {
  // Not used in static title but available for future use
}

/* ═══════════════════════════════════════════
   NAV SEARCH
═══════════════════════════════════════════ */
function initNavSearch() {
  const input = document.getElementById('globalSearchNav');
  if (!input) return;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      openCategory('databases');
      setTimeout(() => {
        const ncbiInput = document.getElementById('ncbiQuery');
        if (ncbiInput) { ncbiInput.value = q; searchNCBI(); }
      }, 150);
    }
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      input.focus(); input.select();
    }
    if (e.key === 'Escape') {
      closeResultModal();
      closeSettings();
    }
  });
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function openCategory(catId) {
  pushNav(catId, null, true);
  // Panels
  document.querySelectorAll('.cat-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${catId}`);
  });
  scrollToApp();
  if (catId === 'ngs') setTimeout(initIGV, 400);
}

/* openTool() — called by new sidebar buttons
   Switches category panel AND the right tool tab,
   then highlights the clicked sidebar button       */
function openTool(catId, toolId, btnEl) {
  pushNav(catId, toolId, true);
  // Open category panel
  document.querySelectorAll('.cat-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${catId}`);
  });
  scrollToApp();
  if (catId === 'ngs') setTimeout(initIGV, 400);

  // Switch the inner tool tab (if toolId provided)
  if (toolId) {
    const panel = document.getElementById(`panel-${catId}`);
    if (panel) {
      panel.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`tool-${catId}-${toolId}`);
      if (target) target.classList.add('active');
      // Activate the matching tab button
      const tabBtn = panel.querySelector(`[onclick*="'${toolId}'"]`);
      if (tabBtn) tabBtn.classList.add('active');
    }
  }

  // Highlight sidebar button
  document.querySelectorAll('.sb-tool-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
}

function switchTool(cat, tool, btn) {
  pushNav(cat, tool, true);
  const panel = document.getElementById(`panel-${cat}`);
  if (!panel) return;
  panel.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  panel.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`tool-${cat}-${tool}`);
  if (target) target.classList.add('active');

  // Sync sidebar button
  const sbId = `sb-${cat}-${tool}`;
  document.querySelectorAll('.sb-tool-btn').forEach(b => b.classList.remove('active'));
  const sbBtn = document.getElementById(sbId);
  if (sbBtn) sbBtn.classList.add('active');
}

function scrollToApp() {
  const el = document.getElementById('appMain');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showHero() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ═══════════════════════════════════════════
   CORE API FETCH
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   CORE API FETCH (SECURE BACKEND ROUTING)
═══════════════════════════════════════════ */
async function apiFetch(path, options = {}) {
  // Configured for Vercel Serverless deployment
  const baseURL = '/api/'; 
  
  const resp = await fetch(baseURL + path, {
    method:  options.method || (options.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body:    options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

/* ═══════════════════════════════════════════
   API STATUS CHECK
═══════════════════════════════════════════ */
async function checkApiStatus() {
  try {
    const data = await apiFetch('health');
    if (data.services?.ncbi)   setPillActive('pill-ncbi');
    if (data.services?.claude) setPillActive('pill-claude');
  } catch (e) {
    console.warn('Health check failed — server may not be running:', e.message);
  }
}
function setPillActive(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}



/* ═══════════════════════════════════════════
   CAT 1 — NCBI
═══════════════════════════════════════════ */
async function searchNCBI() {
  const query = document.getElementById('ncbiQuery')?.value.trim();
  if (!query) { showToast('Please enter a search term', 'warning'); return; }
  const db       = document.getElementById('ncbiDb')?.value || 'gene';
  const organism = document.getElementById('ncbiOrganism')?.value || '';
  BN.lastQuery = query; BN.lastTool = 'ncbi';
  showLoading(`Searching NCBI ${db}…`);
  try {
    const data = await apiFetch('ncbi/search', { body: { query, db, organism, retmax: 15 } });
    hideLoading();
    renderResults(data.results || [], 'results-ncbi', 'ncbi');
    BN.lastResults = data.results || [];
    showToast(`Found ${data.total || 0} results in NCBI ${db}`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-ncbi', e.message, 'NCBI');
    showToast(e.message, 'error');
  }
}
function quickNCBI(q, db) {
  const qi = document.getElementById('ncbiQuery');
  const di = document.getElementById('ncbiDb');
  if (qi) qi.value = q;
  if (di && db) di.value = db;
  searchNCBI();
}

/* ═══════════════════════════════════════════
   CAT 1 — EMBL-EBI
═══════════════════════════════════════════ */
async function searchEBI() {
  const query  = document.getElementById('ebiQuery')?.value.trim();
  const source = document.getElementById('ebiSource')?.value || 'ena';
  if (!query) { showToast('Enter a search term', 'warning'); return; }
  BN.lastTool = 'ebi';
  showLoading(`Searching EMBL-EBI (${source.toUpperCase()})…`);
  try {
    const endpoint = source === 'interpro' ? 'ebi/interpro' : 'ebi/ena';
    const data = await apiFetch(endpoint, { body: { query, dataType: 'sequence', limit: 15 } });
    hideLoading();
    renderResults(data.results || [], 'results-ebi', 'ebi');
    BN.lastResults = data.results || [];
    showToast(`${data.results?.length || 0} results from EMBL-EBI`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-ebi', e.message, 'EMBL-EBI');
    showToast(e.message, 'error');
  }
}
function quickEBI(q, src) {
  const qi = document.getElementById('ebiQuery');
  const si = document.getElementById('ebiSource');
  if (qi) qi.value = q;
  if (si && src) si.value = src;
  searchEBI();
}

/* ═══════════════════════════════════════════
   CAT 1 — DDBJ
═══════════════════════════════════════════ */
async function searchDDBJ() {
  const query = document.getElementById('ddbjQuery')?.value.trim();
  if (!query) { showToast('Enter a search term', 'warning'); return; }
  BN.lastTool = 'ddbj';
  showLoading('Searching DDBJ…');
  try {
    const data = await apiFetch('ddbj/search', { body: { query } });
    hideLoading();
    renderResults(data.results || [], 'results-ddbj', 'ddbj');
    showToast(`${data.results?.length || 0} results from DDBJ`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-ddbj', e.message, 'DDBJ');
    showToast(e.message, 'error');
  }
}
function quickDDBJ(q) {
  const qi = document.getElementById('ddbjQuery');
  if (qi) qi.value = q;
  searchDDBJ();
}

/* ═══════════════════════════════════════════
   CAT 1 — UCSC
═══════════════════════════════════════════ */
async function searchUCSC() {
  const gene   = document.getElementById('ucscQuery')?.value.trim();
  const genome = document.getElementById('ucscGenome')?.value || 'hg38';
  if (!gene) { showToast('Enter a gene or locus', 'warning'); return; }
  BN.lastTool = 'ucsc';
  showLoading('Querying UCSC Genome Browser…');
  // Update embedded iframe
  const frame = document.getElementById('ucscFrame');
  if (frame) {
    frame.src = `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${genome}&hideTracks=1&knownGene=pack&position=${encodeURIComponent(gene)}`;
  }
  try {
    const data = await apiFetch('ucsc/genes', { body: { gene, genome } });
    hideLoading();
    const container = document.getElementById('results-ucsc');
    if (container) {
      // Keep the iframe section and add results above
      const existing = container.querySelector('.ucsc-embed-section');
      const grid = document.createElement('div');
      grid.className = 'results-grid';
      grid.style.marginBottom = '20px';
      (data.results || []).forEach(r => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
          <div class="source-tag source-ucsc">📦 UCSC</div>
          <div class="result-title">${escHtml(r.title || gene)}</div>
          <div class="result-id">${escHtml(r.position || '')}</div>
          <div class="result-desc">${escHtml(r.description || '')}</div>
          <div class="result-actions">
            <a href="${r.link}" target="_blank" rel="noopener noreferrer" class="btn-result-pri">🔭 View in Browser</a>
          </div>`;
        grid.appendChild(card);
      });
      container.innerHTML = '';
      if (grid.children.length) container.appendChild(grid);
      if (existing) container.appendChild(existing);
      else {
        const emb = document.createElement('div');
        emb.className = 'ucsc-embed-section';
        emb.innerHTML = `<h4 style="margin-bottom:12px;color:var(--text-secondary)">Embedded UCSC Genome Browser</h4><div class="iframe-wrap"><iframe id="ucscFrame" class="genome-iframe" src="https://genome.ucsc.edu/cgi-bin/hgTracks?db=${genome}&hideTracks=1&knownGene=pack&position=${encodeURIComponent(gene)}" title="UCSC" loading="lazy"></iframe></div>`;
        container.appendChild(emb);
      }
    }
    showToast(`UCSC search complete for ${gene}`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-ucsc', e.message, 'UCSC');
    showToast(e.message, 'error');
  }
}
function quickUCSC(q) {
  const qi = document.getElementById('ucscQuery');
  if (qi) qi.value = q;
  searchUCSC();
}

/* ═══════════════════════════════════════════
   CAT 2 — BLAST
═══════════════════════════════════════════ */
async function submitBLAST() {
  const sequence = document.getElementById('blastSeq')?.value.trim();
  if (!sequence) { showToast('Paste a sequence first', 'warning'); return; }
  const program    = document.getElementById('blastProgram')?.value || 'blastn';
  const database   = document.getElementById('blastDb')?.value || 'nt';
  const hitlistSize = document.getElementById('blastHits')?.value || 20;

  const statusBox = document.getElementById('blast-status');
  if (statusBox) { statusBox.style.display = 'flex'; statusBox.innerHTML = `<div class="job-spinner"></div><span>Submitting BLAST job…</span>`; }

  clearTimeout(BN.blastPollTimer);
  document.getElementById('results-blast').innerHTML = '';
  BN.lastTool = 'blast';

  try {
    const data = await apiFetch('blast/submit', { body: { sequence, program, database, hitlistSize: parseInt(hitlistSize) } });
    BN.blastRid = data.rid;
    if (statusBox) statusBox.innerHTML = `<div class="job-spinner"></div><span>BLAST job submitted — RID: <strong>${data.rid}</strong> · Est. ${data.estimatedTime}s · Polling every 5s…</span>`;
    showToast(`BLAST job submitted: ${data.rid}`, 'info');
    pollBLAST(data.rid);
  } catch (e) {
    if (statusBox) statusBox.innerHTML = `<span style="color:#f87171">❌ ${escHtml(e.message)}</span>`;
    showToast(e.message, 'error');
  }
}

function pollBLAST(rid) {
  BN.blastPollTimer = setTimeout(async () => {
    try {
      const data = await apiFetch(`blast/results/${rid}`);
      const statusBox = document.getElementById('blast-status');
      if (data.status === 'WAITING') {
        if (statusBox) statusBox.innerHTML = `<div class="job-spinner"></div><span>BLAST job running… RID: ${rid}</span>`;
        pollBLAST(rid);
      } else if (data.status === 'DONE') {
        if (statusBox) { statusBox.innerHTML = `<span style="color:#81c784">✅ BLAST complete — ${data.results?.length || 0} hits</span>`; }
        renderBLASTResults(data);
        showToast(`BLAST complete: ${data.results?.length || 0} hits`, 'success');
        BN.lastResults = data.results || [];
      } else {
        if (statusBox) statusBox.innerHTML = `<span style="color:#f87171">BLAST failed or unknown error</span>`;
        showToast('BLAST job failed', 'error');
      }
    } catch (e) {
      pollBLAST(rid); // retry on network error
    }
  }, 5000);
}

function renderBLASTResults(data) {
  const container = document.getElementById('results-blast');
  if (!container) return;
  if (!data.results?.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No hits found</h3><p>Try a different sequence or database.</p></div>`;
    return;
  }
  const html = `
    <div style="margin-bottom:14px;font-size:0.83rem;color:var(--text-muted)">
      Program: <strong style="color:var(--accent-cyan)">${escHtml(data.program||'')}</strong> · 
      Database: <strong style="color:var(--accent-cyan)">${escHtml(data.database||'')}</strong> · 
      ${data.results.length} hits · Source: <strong>NCBI BLAST</strong>
    </div>
    <div class="blast-results">
      ${data.results.map((h, i) => {
        const ev = parseFloat(h.eValue);
        const evClass = ev < 1e-10 ? 'eval-good' : ev < 0.01 ? 'eval-ok' : 'eval-poor';
        const identity = h.alignLen > 0 ? Math.round((h.identity / h.alignLen) * 100) : 0;
        return `
          <div class="blast-hit">
            <div class="source-tag source-ncbi">📦 NCBI BLAST</div>
            <div class="blast-hit-header">
              <div>
                <div class="blast-hit-title">${escHtml(h.title.slice(0, 100))}</div>
                <div class="blast-acc">${escHtml(h.accession)}</div>
              </div>
              <div class="blast-scores">
                <div class="blast-score-item">
                  <span class="blast-score-label">E-Value</span>
                  <span class="blast-score-val ${evClass}">${formatEval(h.eValue)}</span>
                </div>
                <div class="blast-score-item">
                  <span class="blast-score-label">Bit Score</span>
                  <span class="blast-score-val color-cyan">${Math.round(h.bitScore)}</span>
                </div>
                <div class="blast-score-item">
                  <span class="blast-score-label">Identity</span>
                  <span class="blast-score-val color-green">${identity}%</span>
                </div>
              </div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px">
              Align length: ${h.alignLen} · Gaps: ${h.gaps} · Score: ${h.score}
            </div>
            <div class="identity-bar"><div class="identity-fill" style="width:${identity}%"></div></div>
            ${h.qseq ? `<div class="blast-alignment">
              <div>Query  : ${escHtml(h.qseq.slice(0,60))}${h.qseq.length>60?'…':''}</div>
              <div>Match  : ${escHtml(h.midline?.slice(0,60)||'')}</div>
              <div>Subject: ${escHtml(h.hseq?.slice(0,60)||'')}${h.hseq?.length>60?'…':''}</div>
            </div>` : ''}
            <div style="margin-top:10px">
              <a href="${h.link}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="font-size:0.76rem;text-decoration:none;display:inline-block">View on NCBI ↗</a>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  container.innerHTML = html;
}

function formatEval(ev) {
  const n = parseFloat(ev);
  if (n === 0) return '0.0';
  if (n < 0.001) return n.toExponential(1);
  return n.toPrecision(2);
}

function loadBlastExample() {
  const ta = document.getElementById('blastSeq');
  if (ta) ta.value = `>Example_BRCA1_exon11_fragment
ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGA
GTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAAT
TTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGATATA
ACCAAAAGGAGCCTACAAGAAAGTACGAGATTTAGTCAACTTGTTGAAGAGCTATTGAAAATCATGGA`;
}

function updateBlastDb() {
  const prog = document.getElementById('blastProgram')?.value;
  const dbSel = document.getElementById('blastDb');
  if (!dbSel) return;
  const ntOpts = ['<option value="nt">nt — NCBI Nucleotide</option>','<option value="refseq_rna">RefSeq RNA</option>','<option value="pdbnt">PDB Nucleotide</option>'];
  const aaOpts = ['<option value="nr">nr — NCBI Non-Redundant Protein</option>','<option value="refseq_protein">RefSeq Protein</option>','<option value="swissprot">Swiss-Prot</option>','<option value="pdbaa">PDB Protein</option>'];
  if (prog === 'blastn') dbSel.innerHTML = ntOpts.join('');
  else if (prog === 'blastp') dbSel.innerHTML = aaOpts.join('');
  else if (prog === 'blastx') dbSel.innerHTML = aaOpts.join('');
  else if (prog === 'tblastn') dbSel.innerHTML = ntOpts.join('');
}

/* ═══════════════════════════════════════════
   CAT 2 — CLUSTAL OMEGA
═══════════════════════════════════════════ */
async function submitClustal() {
  const sequences = document.getElementById('clustalSeqs')?.value.trim();
  if (!sequences || !sequences.includes('>')) { showToast('Paste ≥2 FASTA sequences', 'warning'); return; }
  const seqs = sequences.split('>').filter(s => s.trim());
  if (seqs.length < 2) { showToast('Need at least 2 sequences', 'warning'); return; }

  const statusBox = document.getElementById('clustal-status');
  if (statusBox) { statusBox.style.display = 'flex'; statusBox.innerHTML = `<div class="job-spinner"></div><span>Submitting to EBI Clustal Omega…</span>`; }
  document.getElementById('results-clustal').innerHTML = '';
  clearTimeout(BN.clustalPollTimer);

  try {
    const data = await apiFetch('clustal/submit', { body: { sequences, outfmt: 'clustal' } });
    BN.clustalJobId = data.jobId;
    if (statusBox) statusBox.innerHTML = `<div class="job-spinner"></div><span>Clustal Omega job submitted — ID: <strong>${data.jobId}</strong> · Polling…</span>`;
    showToast(`Clustal Omega job: ${data.jobId}`, 'info');
    pollClustal(data.jobId);
  } catch (e) {
    if (statusBox) statusBox.innerHTML = `<span style="color:#f87171">❌ ${escHtml(e.message)}</span>`;
    showToast(e.message, 'error');
  }
}

function pollClustal(jobId) {
  BN.clustalPollTimer = setTimeout(async () => {
    try {
      const data = await apiFetch(`clustal/results/${jobId}`);
      const statusBox = document.getElementById('clustal-status');
      if (data.status === 'FINISHED') {
        if (statusBox) statusBox.innerHTML = `<span style="color:#81c784">✅ Clustal Omega alignment complete</span>`;
        renderClustalResult(data);
        showToast('Clustal Omega alignment done!', 'success');
      } else {
        if (statusBox) statusBox.innerHTML = `<div class="job-spinner"></div><span>Clustal Omega: ${data.status}…</span>`;
        pollClustal(jobId);
      }
    } catch (e) { pollClustal(jobId); }
  }, 4000);
}

function renderClustalResult(data) {
  const container = document.getElementById('results-clustal');
  if (!container) return;
  container.innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:12px">
      <div class="source-tag source-ebi">📦 EBI Clustal Omega</div>
      <span style="font-size:0.8rem;color:var(--text-muted)">Job: ${escHtml(data.jobId)}</span>
    </div>
    <div class="clustal-result">${escHtml(data.alignment || 'No alignment data')}</div>
    ${data.phylotree ? `<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--accent-cyan);font-size:0.85rem;">🌳 Phylogenetic Tree (Newick)</summary><div class="clustal-result" style="margin-top:8px">${escHtml(data.phylotree)}</div></details>` : ''}`;
}

function loadClustalExample() {
  document.getElementById('clustalSeqs').value = `>Human_BRCA1
MDLSALRVEEVQNVINAMQKILECPICLELIKEPVSTKCDHIFCKFCMLKLLNQKKGPSQCPLCKNDITKRSLQESTRFSQLVEELLKIICAFQLDTGLEYANSYNFAKKENNSPEHLKDEVSIIQSMGYRNACKESMMGQWHSASLRSTSKTGPSWAILNKLMYELQNLHPVLNQLQLFEGQRIADEDLGVGRNSFEVRVCACPGRDRRTEEENLHKKGEPVHGQWLDSPQNYTPFGHLKKLNLHFDVEFKKVLPQNPENVHNMQYFNNLNQEQRMHMSSRNLSQQKEAESPAHKALSEPASSRQVSRNSSIVANYAKEATTIA
>Mouse_BRCA1
MDLSALRVEEVQNVINAMQKILECPICLELIKEPVSTKCDHIFCKFCMLKLLNQKKGPSQCPLCKNDITKRSLQESTRFSQLVEELLKIICAFQLDTGLEYANSYNFAKKENNSPEHLKDEVSIIQSMGYRNACKESMMGQWHSASLRSTSKTGPSWAILNKLMYELQNLHPVLNQLQLFEGQRIADEDLGVGRNSFEVRVCACPGRDRRTEEENLHKEGEPVHGQWLDSPQNYTPFGHLKKLNLHFDVEFKKVLPQNPENVHNMQYFNNLNQEQRMHMSSRNLSQQKEAESPAHKALSEPASSRQVSRNSSIVANYAKEATTIA
>Rat_BRCA1
MDLSALRVEEVQNVINAMQKILECPICLELIKEPVSTKCDHIFCKFCMLKLLNQKKGPSQCPLCKNDITKRSLQESTRFSQLVEELLKIICAFQLDTGLEYANSYNFAKKENNSPEHLKDEVSIIQSMGYRNACKESMMGQWHSASLRSTSKTGPSWAILNKLMYELQNLHPVLNQLQLFEGQRIADEDLGVGRNSFEVRVCACPGRDRRTEEENLHKDGEPVHGQWLDSPQNYTPFGHLKKLNLHFDVEFKKVLPQNPENVHNMQYFNNLNQEQRMHMSSRNLSQQKEAESPAHKALSEPASSRQVSRNSSIVANYAKEATTIA`;
}

/* ═══════════════════════════════════════════
   CAT 2 — PAIRWISE ALIGNER (NW / SW)
═══════════════════════════════════════════ */
function updateSeqLen(taId, spanId) {
  const ta   = document.getElementById(taId);
  const span = document.getElementById(spanId);
  if (!ta || !span) return;
  const seq = parseFASTA(ta.value);
  span.textContent = `${seq.length} ${seq.length > 100 ? 'aa/bp' : 'bp'}`;
}

function parseFASTA(text) {
  return text.replace(/^>.*$/mg, '').replace(/\s/g, '').toUpperCase();
}

function runPairwiseAlign() {
  const s1Raw = document.getElementById('pwSeq1')?.value || '';
  const s2Raw = document.getElementById('pwSeq2')?.value || '';
  const s1 = parseFASTA(s1Raw);
  const s2 = parseFASTA(s2Raw);
  if (!s1 || !s2) { showToast('Enter both sequences', 'warning'); return; }
  if (s1.length > 500 || s2.length > 500) { showToast('Sequences too long (max 500 bp for in-browser)', 'warning'); return; }

  const method   = document.getElementById('pwMethod')?.value || 'global';
  const match    =  parseInt(document.getElementById('pwMatch')?.value)    ||  2;
  const mismatch =  parseInt(document.getElementById('pwMismatch')?.value) || -1;
  const gap      =  parseInt(document.getElementById('pwGap')?.value)      || -2;

  showLoading('Running alignment…');
  setTimeout(() => {
    try {
      const result = method === 'global'
        ? needlemanWunsch(s1, s2, match, mismatch, gap)
        : smithWaterman(s1, s2, match, mismatch, gap);
      hideLoading();
      renderPairwiseResult(result, method, s1Raw, s2Raw);
      showToast(`${method === 'global' ? 'Needleman-Wunsch' : 'Smith-Waterman'} alignment complete`, 'success');
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, 50);
}

function needlemanWunsch(s1, s2, match, mismatch, gap) {
  const m = s1.length, n = s2.length;
  const dp = Array.from({length: m+1}, (_, i) =>
    Array.from({length: n+1}, (_, j) => i === 0 ? j*gap : j === 0 ? i*gap : 0)
  );
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * gap;
    for (let j = 1; j <= n; j++) {
      const diag = dp[i-1][j-1] + (s1[i-1] === s2[j-1] ? match : mismatch);
      dp[i][j] = Math.max(diag, dp[i-1][j] + gap, dp[i][j-1] + gap);
    }
  }
  // Traceback
  let a1='', a2='', mid='', i=m, j=n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i-1][j-1] + (s1[i-1] === s2[j-1] ? match : mismatch)) {
      a1 = s1[i-1] + a1; a2 = s2[j-1] + a2;
      mid = (s1[i-1] === s2[j-1] ? '|' : '.') + mid;
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i-1][j] + gap) {
      a1 = s1[i-1] + a1; a2 = '-' + a2; mid = ' ' + mid; i--;
    } else {
      a1 = '-' + a1; a2 = s2[j-1] + a2; mid = ' ' + mid; j--;
    }
  }
  const matches   = [...mid].filter(c => c === '|').length;
  const gaps_     = [...a1].filter(c => c === '-').length + [...a2].filter(c => c === '-').length;
  const identity  = a1.length > 0 ? (matches / a1.length * 100).toFixed(1) : 0;
  return { a1, a2, mid, score: dp[m][n], matches, gaps: gaps_, identity, method: 'Needleman-Wunsch (Global)' };
}

function smithWaterman(s1, s2, match, mismatch, gap) {
  const m = s1.length, n = s2.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  let maxScore = 0, maxI = 0, maxJ = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const diag = dp[i-1][j-1] + (s1[i-1] === s2[j-1] ? match : mismatch);
      dp[i][j] = Math.max(0, diag, dp[i-1][j] + gap, dp[i][j-1] + gap);
      if (dp[i][j] > maxScore) { maxScore = dp[i][j]; maxI = i; maxJ = j; }
    }
  }
  let a1='', a2='', mid='', i=maxI, j=maxJ;
  while (i > 0 && j > 0 && dp[i][j] > 0) {
    if (dp[i][j] === dp[i-1][j-1] + (s1[i-1] === s2[j-1] ? match : mismatch)) {
      a1 = s1[i-1] + a1; a2 = s2[j-1] + a2;
      mid = (s1[i-1] === s2[j-1] ? '|' : '.') + mid;
      i--; j--;
    } else if (dp[i][j] === dp[i-1][j] + gap) {
      a1 = s1[i-1] + a1; a2 = '-' + a2; mid = ' ' + mid; i--;
    } else {
      a1 = '-' + a1; a2 = s2[j-1] + a2; mid = ' ' + mid; j--;
    }
  }
  const matches  = [...mid].filter(c => c === '|').length;
  const gaps_    = [...a1].filter(c => c === '-').length + [...a2].filter(c => c === '-').length;
  const identity = a1.length > 0 ? (matches / a1.length * 100).toFixed(1) : 0;
  return { a1, a2, mid, score: maxScore, matches, gaps: gaps_, identity, method: 'Smith-Waterman (Local)' };
}

function renderPairwiseResult(result, method, rawS1, rawS2) {
  const container = document.getElementById('results-pairwise');
  if (!container) return;
  const chunkSize = 60;
  let alignHtml = '';
  for (let pos = 0; pos < result.a1.length; pos += chunkSize) {
    const chunk1 = result.a1.slice(pos, pos+chunkSize);
    const chunk2 = result.a2.slice(pos, pos+chunkSize);
    const chunkM = result.mid.slice(pos, pos+chunkSize);
    const colorSeq = seq => [...seq].map(c =>
      c === '-' ? `<span class="seq-gap">${c}</span>` : `<span class="seq-match">${c}</span>`
    ).join('');
    alignHtml += `
      <div class="align-row-vis"><span class="align-lbl">Seq1 ${pos+1}:</span><span>${colorSeq(chunk1)}</span></div>
      <div class="align-row-vis"><span class="align-lbl">      </span><span class="match-chars">${escHtml(chunkM)}</span></div>
      <div class="align-row-vis"><span class="align-lbl">Seq2 ${pos+1}:</span><span>${colorSeq(chunk2)}</span></div>
      <div style="height:8px"></div>`;
  }
  container.innerHTML = `
    <div class="align-result-box">
      <div style="margin-bottom:12px"><span class="source-tag source-ebi">⚙️ Built-in · ${escHtml(result.method)}</span></div>
      <div class="align-scores-row">
        <div class="align-score-box"><span class="asb-label">Score</span><span class="asb-val color-cyan">${result.score}</span></div>
        <div class="align-score-box"><span class="asb-label">Identity</span><span class="asb-val color-green">${result.identity}%</span></div>
        <div class="align-score-box"><span class="asb-label">Matches</span><span class="asb-val color-cyan">${result.matches}</span></div>
        <div class="align-score-box"><span class="asb-label">Gaps</span><span class="asb-val color-orange">${result.gaps}</span></div>
        <div class="align-score-box"><span class="asb-label">Length</span><span class="asb-val" style="color:var(--text-secondary)">${result.a1.length}</span></div>
      </div>
      <div class="sim-bar"><div class="sim-fill" style="width:${result.identity}%"></div></div>
      <div style="height:16px"></div>
      <div class="align-vis">${alignHtml}</div>
    </div>`;
}

function loadPairwiseExample() {
  document.getElementById('pwSeq1').value = '>Human_HBA\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR';
  document.getElementById('pwSeq2').value = '>Human_HBB\nMVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
  updateSeqLen('pwSeq1', 's1len');
  updateSeqLen('pwSeq2', 's2len');
}

function clearPairwise() {
  ['pwSeq1','pwSeq2'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  ['s1len','s2len'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent='0 bp'; });
  const r = document.getElementById('results-pairwise');
  if (r) r.innerHTML = '';
}

/* ═══════════════════════════════════════════
   CAT 5 — UNIPROT
═══════════════════════════════════════════ */
async function searchUniProt() {
  const query    = document.getElementById('uniprotQuery')?.value.trim();
  const organism = document.getElementById('uniprotOrganism')?.value || '';
  const reviewed = document.getElementById('uniprotReviewed')?.value || '';
  if (!query) { showToast('Enter protein name or accession', 'warning'); return; }
  BN.lastTool = 'uniprot'; BN.lastQuery = query;
  showLoading('Searching UniProt…');
  try {
    const data = await apiFetch('uniprot/search', { body: { query, organism, reviewed: reviewed === 'true', size: 20 } });
    hideLoading();
    renderProteinCards(data.results || [], 'results-uniprot');
    BN.lastResults = data.results || [];
    showToast(`${data.results?.length || 0} proteins from UniProt`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-uniprot', e.message, 'UniProt');
    showToast(e.message, 'error');
  }
}
function quickUniProt(q) {
  const qi = document.getElementById('uniprotQuery');
  if (qi) qi.value = q;
  searchUniProt();
}

function renderProteinCards(proteins, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!proteins.length) {
    container.innerHTML = emptyState('🧬', 'No proteins found', 'Try a different search term or remove filters.');
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'results-grid';
  proteins.forEach(p => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.onclick = () => showResultModal(p.name || p.id, buildProteinModal(p), p);
    card.innerHTML = `
      <div class="source-tag source-uniprot">📦 UniProt ${p.reviewed ? '(Reviewed)' : ''}</div>
      <div class="result-title">${escHtml(p.name || p.id)}</div>
      <div class="result-id">${escHtml(p.accession)} · ${escHtml(p.gene || '')}</div>
      <div class="result-meta">
        <span class="result-meta-item">🦠 ${escHtml(p.organism || '')}</span>
        ${p.length ? `<span class="result-meta-item">📏 ${p.length} aa</span>` : ''}
        ${p.pdbIds?.length ? `<span class="result-meta-item">🔭 ${p.pdbIds.length} PDB structures</span>` : ''}
      </div>
      <div class="result-desc">${escHtml((p.function || p.subcellular || 'No function data').slice(0, 160))}</div>
      <div class="result-actions">
        <button class="btn-result-pri" onclick="event.stopPropagation();openUniProtEntry('${p.accession}')">Details</button>
        ${p.pdbIds?.[0] ? `<button class="btn-result-sec" onclick="event.stopPropagation();directLoadPDB('${p.pdbIds[0]}');openCategory('proteomics');switchTool('proteomics','pdb',null)">3D Structure</button>` : ''}
        <a href="${p.link}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="text-decoration:none" onclick="event.stopPropagation()">UniProt ↗</a>
      </div>`;
    grid.appendChild(card);
  });
  container.innerHTML = '';
  container.appendChild(grid);
}

function buildProteinModal(p) {
  return `
    <div class="source-tag source-uniprot" style="margin-bottom:12px">📦 UniProt</div>
    <div class="info-row"><div class="info-label-sm">Accession</div><div class="info-val mono">${escHtml(p.accession)}</div></div>
    <div class="info-row"><div class="info-label-sm">Gene</div><div class="info-val">${escHtml(p.gene || 'N/A')}</div></div>
    <div class="info-row"><div class="info-label-sm">Organism</div><div class="info-val">${escHtml(p.organism || 'N/A')}</div></div>
    <div class="info-row"><div class="info-label-sm">Length</div><div class="info-val">${p.length} amino acids</div></div>
    <div class="info-row"><div class="info-label-sm">Function</div><div class="info-val">${escHtml(p.function || 'Not available')}</div></div>
    <div class="info-row"><div class="info-label-sm">Subcellular Location</div><div class="info-val">${escHtml(p.subcellular || 'N/A')}</div></div>
    ${p.pdbIds?.length ? `<div class="info-row"><div class="info-label-sm">PDB Structures</div><div class="info-val">${p.pdbIds.map(id=>`<a href="#" onclick="event.preventDefault();directLoadPDB('${id}');closeResultModal()" style="color:var(--accent-cyan);margin-right:8px">${id}</a>`).join('')}</div></div>` : ''}
    ${p.sequence ? `<div class="info-row"><div class="info-label-sm">Sequence (first 100 aa)</div><div class="info-val mono" style="word-break:break-all;font-size:0.72rem">${escHtml(p.sequence.slice(0,100))}…</div></div>` : ''}`;
}

async function openUniProtEntry(accession) {
  showLoading('Loading UniProt entry…');
  try {
    const data = await apiFetch(`uniprot/entry/${accession}`);
    hideLoading();
    // Quick show in modal
    const p = data.data;
    const name = p?.proteinDescription?.recommendedName?.fullName?.value || accession;
    showResultModal(name, buildProteinModal({
      accession: p.primaryAccession,
      gene: p.genes?.[0]?.geneName?.value || '',
      organism: p.organism?.scientificName || '',
      length: p.sequence?.length || 0,
      function: p.comments?.find(c=>c.commentType==='FUNCTION')?.texts?.[0]?.value || '',
      subcellular: p.comments?.find(c=>c.commentType==='SUBCELLULAR LOCATION')?.subcellularLocations?.map(l=>l.location?.value).join(', ') || '',
      pdbIds: (p.uniProtKBCrossReferences||[]).filter(r=>r.database==='PDB').map(r=>r.id).slice(0,5),
      sequence: p.sequence?.value || '',
      link: `https://www.uniprot.org/uniprotkb/${accession}`,
    }), data.data);
  } catch(e) { hideLoading(); showToast(e.message, 'error'); }
}

/* ═══════════════════════════════════════════
   CAT 5 — PDB
═══════════════════════════════════════════ */
async function searchPDB() {
  const query = document.getElementById('pdbQuery')?.value.trim();
  if (!query) { showToast('Enter a PDB ID or search term', 'warning'); return; }
  // If it looks like a 4-char PDB ID, load directly
  if (/^[0-9][A-Z0-9]{3}$/i.test(query.trim())) { directLoadPDB(query.trim()); return; }
  BN.lastTool = 'pdb';
  showLoading('Searching RCSB PDB…');
  try {
    const data = await apiFetch('pdb/search', { body: { query, limit: 15 } });
    hideLoading();
    renderPDBCards(data.results || []);
    showToast(`${data.results?.length || 0} structures from RCSB PDB`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-pdb', e.message, 'RCSB PDB');
    showToast(e.message, 'error');
  }
}

function renderPDBCards(structures) {
  const container = document.getElementById('results-pdb');
  if (!container) return;
  if (!structures.length) {
    container.innerHTML = emptyState('🔭', 'No structures found', 'Try a different search term or PDB ID.');
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'results-grid';
  structures.forEach(s => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.onclick = () => directLoadPDB(s.id);
    card.innerHTML = `
      <div class="source-tag source-pdb">📦 RCSB PDB</div>
      <div class="result-title">${escHtml(s.title || s.id)}</div>
      <div class="result-id">${escHtml(s.id)}</div>
      <div class="result-meta">
        <span class="result-meta-item">⚗️ ${escHtml(s.method || 'N/A')}</span>
        ${s.resolution ? `<span class="result-meta-item">🔬 ${s.resolution.toFixed(2)}Å</span>` : ''}
        <span class="result-meta-item">🧩 ${s.chains} chain(s)</span>
      </div>
      <div class="result-desc">${escHtml(s.authors || '')}<br/>${escHtml(s.deposited || '')}</div>
      <div class="result-actions">
        <button class="btn-result-pri" onclick="event.stopPropagation();directLoadPDB('${s.id}')">🔭 View 3D</button>
        <a href="${s.link}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="text-decoration:none" onclick="event.stopPropagation()">RCSB ↗</a>
      </div>`;
    grid.appendChild(card);
  });
  container.innerHTML = '';
  container.appendChild(grid);
}

async function directLoadPDB(id) {
  id = id.toUpperCase();
  showLoading(`Loading PDB ${id}…`);
  try {
    const data = await apiFetch(`pdb/entry/${id}`);
    hideLoading();
    const section = document.getElementById('pdb-viewer-section');
    const frame   = document.getElementById('pdbFrame');
    const infoPanel = document.getElementById('pdbInfoPanel');
    if (section) section.style.display = 'block';
    if (frame) frame.src = `https://www.rcsb.org/3d-view/${id}`;
    if (infoPanel) renderPDBInfo(data.data, infoPanel);
    document.getElementById('results-pdb').innerHTML = '';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`Loaded PDB ${id}`, 'success');
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

function loadPDBEntry() {
  const q = document.getElementById('pdbQuery')?.value.trim();
  if (q) directLoadPDB(q);
}

function renderPDBInfo(d, panel) {
  if (!d || !panel) return;
  panel.innerHTML = `
    <div class="source-tag source-pdb" style="margin-bottom:12px">📦 RCSB PDB</div>
    <div class="info-row"><div class="info-label-sm">PDB ID</div><div class="info-val mono">${escHtml(d.rcsb_id||'')}</div></div>
    <div class="info-row"><div class="info-label-sm">Title</div><div class="info-val">${escHtml(d.struct?.title||'')}</div></div>
    <div class="info-row"><div class="info-label-sm">Method</div><div class="info-val">${escHtml(d.exptl?.[0]?.method||'N/A')}</div></div>
    ${d.rcsb_entry_info?.resolution_combined?.[0] ? `<div class="info-row"><div class="info-label-sm">Resolution</div><div class="info-val">${d.rcsb_entry_info.resolution_combined[0].toFixed(2)} Å</div></div>` : ''}
    <div class="info-row"><div class="info-label-sm">Deposited</div><div class="info-val">${escHtml(d.rcsb_accession_info?.deposit_date||'N/A')}</div></div>
    <div class="info-row"><div class="info-label-sm">Authors</div><div class="info-val">${escHtml((d.audit_author||[]).map(a=>a.name).slice(0,4).join(', '))}</div></div>
    <div style="margin-top:14px">
      <a href="https://www.rcsb.org/structure/${d.rcsb_id}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="text-decoration:none;display:inline-block">RCSB Page ↗</a>
    </div>`;
}

/* ═══════════════════════════════════════════
   CAT 5 — ALPHAFOLD
═══════════════════════════════════════════ */
async function fetchAlphaFold() {
  const acc = document.getElementById('alphafoldAcc')?.value.trim().toUpperCase();
  if (!acc) { showToast('Enter a UniProt accession', 'warning'); return; }
  BN.lastTool = 'alphafold';
  showLoading(`Fetching AlphaFold prediction for ${acc}…`);
  try {
    const data = await apiFetch(`alphafold/${acc}`);
    hideLoading();
    renderAlphaFoldResult(data, acc);
    showToast(`AlphaFold prediction loaded for ${acc}`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-alphafold', e.message, 'AlphaFold');
    showToast(e.message, 'error');
  }
}
function quickAlphaFold(acc) {
  const qi = document.getElementById('alphafoldAcc');
  if (qi) qi.value = acc;
  fetchAlphaFold();
}

function renderAlphaFoldResult(data, acc) {
  const container = document.getElementById('results-alphafold');
  if (!container) return;
  const preds = data.predictions || [];
  if (!preds.length) {
    container.innerHTML = emptyState('🔭','No prediction found',`AlphaFold may not have a prediction for ${acc}.`);
    return;
  }
  const p = preds[0];
  container.innerHTML = `
    <div class="alphafold-card">
      <div class="af-header">
        <div class="af-title">${escHtml(p.uniprotDescription || acc)}</div>
        <span class="af-acc">${escHtml(acc)}</span>
      </div>
      <div class="source-tag source-alphafold" style="margin-bottom:12px">📦 AlphaFold Database (EMBL-EBI)</div>
      <div class="af-quality">
        <span class="af-q-chip q-very-high">pLDDT ≥ 90: Very high confidence</span>
        <span class="af-q-chip q-high">70–90: High confidence</span>
        <span class="af-q-chip q-medium">50–70: Low confidence</span>
        <span class="af-q-chip q-low">&lt; 50: Very low</span>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;font-size:0.82rem;color:var(--text-secondary)">
        <span>Model: <strong style="color:var(--accent-cyan)">${escHtml(p.latestVersion||'v4')}</strong></span>
        <span>Gene: <strong style="color:var(--accent-cyan)">${escHtml(p.gene || 'N/A')}</strong></span>
        <span>Organism: <strong style="color:var(--accent-cyan)">${escHtml(p.uniprotAccession || acc)}</strong></span>
      </div>
      <div class="af-viewer-wrap">
        <iframe class="af-viewer-iframe"
          src="https://alphafold.ebi.ac.uk/entry/${acc}#card-experimental"
          title="AlphaFold Structure Viewer" loading="lazy"></iframe>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px">
        <a href="https://alphafold.ebi.ac.uk/entry/${acc}" target="_blank" rel="noopener noreferrer" class="btn-result-pri" style="text-decoration:none">AlphaFold Page ↗</a>
        <a href="${p.pdbUrl||`https://alphafold.ebi.ac.uk/files/AF-${acc}-F1-model_v4.pdb`}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="text-decoration:none">Download PDB</a>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════
   CAT 5 — STRING
═══════════════════════════════════════════ */
async function fetchSTRING() {
  const protein = document.getElementById('stringProtein')?.value.trim();
  const species = document.getElementById('stringSpecies')?.value || '9606';
  const score   = document.getElementById('stringScore')?.value || '400';
  if (!protein) { showToast('Enter a protein or gene name', 'warning'); return; }
  BN.lastTool = 'string';
  showLoading(`Fetching STRING network for ${protein}…`);
  try {
    const [netData, partData] = await Promise.all([
      apiFetch('string/network',  { body: { protein, species: parseInt(species), score: parseInt(score) } }),
      apiFetch('string/partners', { body: { protein, species: parseInt(species), limit: 25 } }),
    ]);
    hideLoading();
    BN.stringData = { network: netData, partners: partData };
    document.getElementById('string-network-wrap').style.display = 'block';
    renderSTRINGNetwork(netData.network || [], partData.partners || []);
    renderSTRINGTable(partData.partners || []);
    document.getElementById('results-string').innerHTML = '';
    showToast(`STRING network loaded for ${protein}`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-string', e.message, 'STRING');
    showToast(e.message, 'error');
  }
}
function quickSTRING(p) {
  const qi = document.getElementById('stringProtein');
  if (qi) qi.value = p;
  fetchSTRING();
}

function renderSTRINGNetwork(networkData, partners) {
  const canvas = document.getElementById('stringCanvas');
  if (!canvas) return;
  canvas.width  = canvas.parentElement.offsetWidth - 32;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Build unique nodes from partners
  const nodeMap = new Map();
  partners.slice(0, 20).forEach(p => {
    if (!nodeMap.has(p.stringId_A)) nodeMap.set(p.stringId_A, { id: p.stringId_A, label: p.preferredName_A || p.stringId_A, x: W/2, y: H/2 });
    if (!nodeMap.has(p.stringId_B)) nodeMap.set(p.stringId_B, { id: p.stringId_B, label: p.preferredName_B || p.stringId_B, x: Math.random()*W*0.8+W*0.1, y: Math.random()*H*0.8+H*0.1 });
  });
  const nodes = [...nodeMap.values()];
  const edges = partners.slice(0, 20).map(p => ({
    source: p.stringId_A, target: p.stringId_B, score: p.score/1000
  }));

  // Force-directed layout
  for (let iter = 0; iter < 300; iter++) {
    const k = Math.sqrt((W * H) / nodes.length);
    const displacements = nodes.map(() => ({ dx: 0, dy: 0 }));
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i+1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(Math.sqrt(dx*dx+dy*dy), 0.01);
        const f = k*k/dist;
        displacements[i].dx += dx/dist*f;
        displacements[i].dy += dy/dist*f;
        displacements[j].dx -= dx/dist*f;
        displacements[j].dy -= dy/dist*f;
      }
    }
    // Attraction
    edges.forEach(e => {
      const si = nodes.findIndex(n => n.id === e.source);
      const ti = nodes.findIndex(n => n.id === e.target);
      if (si < 0 || ti < 0) return;
      const dx = nodes[si].x - nodes[ti].x;
      const dy = nodes[si].y - nodes[ti].y;
      const dist = Math.max(Math.sqrt(dx*dx+dy*dy), 0.01);
      const f = dist*dist/k;
      displacements[si].dx -= dx/dist*f*0.5;
      displacements[si].dy -= dy/dist*f*0.5;
      displacements[ti].dx += dx/dist*f*0.5;
      displacements[ti].dy += dy/dist*f*0.5;
    });
    const temp = Math.max(5, 50 - iter*0.16);
    nodes.forEach((n, i) => {
      const mag = Math.sqrt(displacements[i].dx**2 + displacements[i].dy**2);
      if (mag > 0) {
        n.x += displacements[i].dx/mag * Math.min(mag, temp);
        n.y += displacements[i].dy/mag * Math.min(mag, temp);
        n.x = Math.max(50, Math.min(W-50, n.x));
        n.y = Math.max(30, Math.min(H-30, n.y));
      }
    });
  }

  ctx.clearRect(0, 0, W, H);
  // Draw edges
  edges.forEach(e => {
    const si = nodes.find(n => n.id === e.source);
    const ti = nodes.find(n => n.id === e.target);
    if (!si || !ti) return;
    ctx.beginPath();
    ctx.moveTo(si.x, si.y); ctx.lineTo(ti.x, ti.y);
    ctx.strokeStyle = `rgba(100,255,218,${e.score * 0.6})`;
    ctx.lineWidth = Math.max(0.5, e.score * 3);
    ctx.stroke();
  });
  // Draw nodes
  nodes.forEach((n, i) => {
    const r = i === 0 ? 18 : 12;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI*2);
    ctx.fillStyle = i === 0 ? 'rgba(100,255,218,0.8)' : 'rgba(199,125,255,0.7)';
    ctx.fill();
    ctx.strokeStyle = i === 0 ? '#64ffda' : '#c77dff';
    ctx.lineWidth = 2; ctx.stroke();
    // Label
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${i===0?12:10}px Inter,sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(n.label, n.x, n.y + r + 14);
  });
}

function renderSTRINGTable(partners) {
  const container = document.getElementById('results-string-table');
  if (!container || !partners.length) return;
  container.innerHTML = `
    <div style="margin:12px 0 8px;font-size:0.82rem;color:var(--text-muted)">
      <span class="source-tag source-string">📦 STRING Database</span>
    </div>
    <div style="overflow-x:auto">
      <table class="string-table">
        <thead><tr>
          <th>Partner</th><th>Combined Score</th><th>Co-expression</th><th>Experimental</th>
        </tr></thead>
        <tbody>
          ${partners.slice(0,20).map(p => `<tr>
            <td><strong style="color:var(--text-primary)">${escHtml(p.preferredName_B||p.stringId_B||'')}</strong></td>
            <td><span class="string-score">${((p.score||0)/1000).toFixed(3)}</span></td>
            <td>${p.coexpression !== undefined ? ((p.coexpression/1000).toFixed(3)) : 'N/A'}</td>
            <td>${p.experimentally_determined_interaction !== undefined ? ((p.experimentally_determined_interaction/1000).toFixed(3)) : 'N/A'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ═══════════════════════════════════════════
   CAT 6 — TREE BUILDER
═══════════════════════════════════════════ */
function parseFASTAMultiple(text) {
  const entries = [];
  let current = null;
  text.split('\n').forEach(line => {
    line = line.trim();
    if (line.startsWith('>')) {
      if (current) entries.push(current);
      current = { name: line.slice(1).trim(), seq: '' };
    } else if (current) {
      current.seq += line.toUpperCase().replace(/[^A-Z]/g, '');
    }
  });
  if (current) entries.push(current);
  return entries;
}

function computeDistance(s1, s2) {
  const len = Math.min(s1.length, s2.length);
  if (!len) return 1;
  let diff = 0;
  for (let i = 0; i < len; i++) if (s1[i] !== s2[i]) diff++;
  return diff / len;
}

function computeDistanceMatrix(seqs) {
  const n = seqs.length;
  const D = Array.from({length:n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i+1; j < n; j++) {
      D[i][j] = D[j][i] = computeDistance(seqs[i].seq, seqs[j].seq);
    }
  return D;
}

function neighborJoining(names, dist) {
  const n = names.length;
  let D = dist.map(r => [...r]);
  let active = names.map((name, i) => ({ name, i }));
  let nodes = names.map(name => ({ name, children: [], length: 0 }));

  while (active.length > 2) {
    const m = active.length;
    const r = active.map((_, i) => active.reduce((sum, __, j) => sum + D[active[i].i][active[j].i], 0));
    let minQ = Infinity, pi = 0, pj = 1;
    for (let i = 0; i < m; i++)
      for (let j = i+1; j < m; j++) {
        const q = (m-2)*D[active[i].i][active[j].i] - r[i] - r[j];
        if (q < minQ) { minQ = q; pi = i; pj = j; }
      }
    const u = nodes.length;
    const di = (D[active[pi].i][active[pj].i] + (r[pi]-r[pj])/(m-2))/2;
    const dj = D[active[pi].i][active[pj].i] - di;
    const nc = { name: `Node${u}`, children: [
      { ...nodes[active[pi].i], length: Math.max(0, di) },
      { ...nodes[active[pj].i], length: Math.max(0, dj) }
    ], length: 0 };
    nodes.push(nc);

    const newIdx = u;
    const newRow = active.map((a, k) => {
      if (k === pi || k === pj) return 0;
      return (D[active[pi].i][a.i] + D[active[pj].i][a.i] - D[active[pi].i][active[pj].i]) / 2;
    });
    // Expand D
    for (let k = 0; k < D.length; k++) D[k].push(0);
    D.push(new Array(D[0].length).fill(0));
    active.forEach((a, k) => { D[newIdx][a.i] = D[a.i][newIdx] = newRow[k]; });

    active = active.filter((_, k) => k !== pi && k !== pj);
    active.push({ name: `Node${u}`, i: newIdx });
    nodes[newIdx] = nc;
  }

  if (active.length === 2) {
    const root = {
      name: 'Root',
      children: [
        { ...nodes[active[0].i], length: D[active[0].i][active[1].i]/2 },
        { ...nodes[active[1].i], length: D[active[0].i][active[1].i]/2 }
      ],
      length: 0
    };
    return root;
  }
  return nodes[active[0].i];
}

function getLeaves(node) {
  if (!node.children || !node.children.length) return [node];
  return node.children.flatMap(getLeaves);
}

function buildTree() {
  const seqs = parseFASTAMultiple(document.getElementById('megaSeqs')?.value || '');
  if (seqs.length < 3) { showToast('Need at least 3 sequences', 'warning'); return; }
  const method = document.getElementById('treeMethodSelect')?.value || 'nj';
  showLoading('Building phylogenetic tree…');
  setTimeout(() => {
    try {
      const D = computeDistanceMatrix(seqs);
      const tree = neighborJoining(seqs.map(s => s.name), D);
      BN.treeData = { tree, seqs };
      hideLoading();
      document.getElementById('tree-container').style.display = 'block';
      renderTreeCanvas(tree, seqs);
      showToast('Phylogenetic tree built!', 'success');
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, 100);
}

function renderTreeCanvas(tree, seqs) {
  const canvas = document.getElementById('treeCanvas');
  if (!canvas) return;
  canvas.width  = canvas.parentElement.offsetWidth - 40;
  canvas.height = Math.max(300, seqs.length * 40 + 60);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { left: 30, right: 200, top: 30, bottom: 30 };
  ctx.clearRect(0, 0, W, H);

  const leaves   = getLeaves(tree);
  const leafY    = {};
  const yStep    = (H - pad.top - pad.bottom) / Math.max(leaves.length-1, 1);
  leaves.forEach((leaf, i) => { leafY[leaf.name] = pad.top + i * yStep; });

  // Get max depth for scaling
  function maxDepth(node, d=0) {
    if (!node.children?.length) return d;
    return Math.max(...node.children.map(c => maxDepth(c, d + (c.length||0.1))));
  }
  const maxD = maxDepth(tree) || 1;
  const xScale = (W - pad.left - pad.right) / maxD;

  function drawNode(node, x) {
    if (!node.children?.length) {
      const y = leafY[node.name];
      // Leaf dot
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2);
      ctx.fillStyle = '#64ffda'; ctx.fill();
      // Label
      ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 12px Inter,sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(node.name, x + 10, y + 4);
      return y;
    }

    const childY = node.children.map(c => drawNode(c, x + (c.length||0.1)*xScale));
    const midY   = (Math.min(...childY) + Math.max(...childY)) / 2;

    // Vertical line
    ctx.beginPath(); ctx.moveTo(x, Math.min(...childY)); ctx.lineTo(x, Math.max(...childY));
    ctx.strokeStyle = 'rgba(100,255,218,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Horizontal lines to children
    node.children.forEach((c, idx) => {
      ctx.beginPath(); ctx.moveTo(x, childY[idx]); ctx.lineTo(x + (c.length||0.1)*xScale, childY[idx]);
      ctx.strokeStyle = '#64ffda'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    return midY;
  }
  drawNode(tree, pad.left);

  // Stats
  const statsEl = document.getElementById('tree-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="tree-stat"><strong>Sequences:</strong> ${seqs.length}</div>
      <div class="tree-stat"><strong>Method:</strong> Neighbor-Joining</div>
      <div class="tree-stat"><strong>Distance:</strong> p-Distance</div>`;
  }
}

function loadTreeExample() {
  document.getElementById('megaSeqs').value = `>Homo_sapiens
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
>Pan_troglodytes
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAACGATCGATCGATCGAT
>Gorilla_gorilla
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAGCGATCGATCGATCGAT
>Mus_musculus
ATGCGATCAATCGATCAATCGATCAATCGATCAATCGATCAATCGATCAATCGATCAATCGAT
>Rattus_norvegicus
ATGCGATCAATCGATCAATCGATCAATCGATCAATCGATCAATCGATCAATCGATCAAGCGAT
>Gallus_gallus
ATGCGATCTATCGATCTATCGATCTATCGATCTATCGATCTATCGATCTATCGATCTATCGAT`;
}

function exportTree() {
  const canvas = document.getElementById('treeCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = 'bionexus_tree.png';
  link.href = canvas.toDataURL();
  link.click();
  showToast('Tree exported as PNG', 'success');
}

/* ═══════════════════════════════════════════
   CAT 6 — PHYML
═══════════════════════════════════════════ */
async function submitPhyML() {
  const alignment = document.getElementById('phymlSeqs')?.value.trim();
  if (!alignment) { showToast('Paste aligned sequences first', 'warning'); return; }
  const model = document.getElementById('phymlModel')?.value || 'GTR';
  const statusBox = document.getElementById('phyml-status');
  if (statusBox) { statusBox.style.display='flex'; statusBox.innerHTML=`<div class="job-spinner"></div><span>Submitting to EBI PhyML…</span>`; }
  try {
    const data = await apiFetch('phyml/submit', { body: { alignment, model } });
    BN.phymlJobId = data.jobId;
    if (statusBox) statusBox.innerHTML = `<div class="job-spinner"></div><span>PhyML job: <strong>${data.jobId}</strong> · Polling…</span>`;
    pollPhyML(data.jobId);
    showToast(`PhyML job submitted: ${data.jobId}`, 'info');
  } catch (e) {
    if (statusBox) statusBox.innerHTML = `<span style="color:#f87171">❌ ${escHtml(e.message)}</span>`;
    showToast(e.message, 'error');
  }
}

function pollPhyML(jobId) {
  BN.phymlPollTimer = setTimeout(async () => {
    try {
      const data = await apiFetch(`phyml/results/${jobId}`);
      const statusBox = document.getElementById('phyml-status');
      if (data.status === 'FINISHED') {
        if (statusBox) statusBox.innerHTML = `<span style="color:#81c784">✅ PhyML tree complete</span>`;
        document.getElementById('results-phyml').innerHTML = `
          <div class="source-tag source-ebi" style="margin-bottom:12px">📦 EBI PhyML</div>
          <h4 style="margin-bottom:8px;color:var(--text-secondary)">Newick Tree:</h4>
          <div class="clustal-result">${escHtml(data.tree||'No tree data')}</div>`;
        showToast('PhyML tree complete!', 'success');
      } else {
        if (statusBox) statusBox.innerHTML = `<div class="job-spinner"></div><span>PhyML: ${data.status}…</span>`;
        pollPhyML(jobId);
      }
    } catch (e) { pollPhyML(jobId); }
  }, 5000);
}

/* ═══════════════════════════════════════════
   CAT 7 — KEGG
═══════════════════════════════════════════ */
async function searchKEGG() {
  const query    = document.getElementById('keggQuery')?.value.trim();
  const organism = document.getElementById('keggOrganism')?.value || 'hsa';
  if (!query) { showToast('Enter pathway name', 'warning'); return; }
  BN.lastTool = 'kegg';
  showLoading('Searching KEGG pathways…');
  try {
    const data = await apiFetch('kegg/pathway', { body: { query, organism } });
    hideLoading();
    renderKEGGList(data.results || []);
    showToast(`${data.results?.length || 0} KEGG pathways found`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-kegg', e.message, 'KEGG');
    showToast(e.message, 'error');
  }
}

function renderKEGGList(results) {
  const container = document.getElementById('results-kegg');
  if (!container) return;
  if (!results.length) {
    container.innerHTML = emptyState('🗺️','No pathways found','Try a different search term.');
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'results-grid';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.onclick = () => loadKEGGPathway(r.id);
    card.innerHTML = `
      <div class="source-tag source-kegg">📦 KEGG</div>
      <div class="result-title">${escHtml(r.name || r.id)}</div>
      <div class="result-id">${escHtml(r.id)}</div>
      <div class="result-actions">
        <button class="btn-result-pri" onclick="event.stopPropagation();loadKEGGPathway('${r.id}')">🗺️ View Pathway</button>
        <a href="${r.link}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="text-decoration:none" onclick="event.stopPropagation()">KEGG ↗</a>
      </div>`;
    grid.appendChild(card);
  });
  container.innerHTML = ''; container.appendChild(grid);
}

async function loadKEGGPathway(id) {
  showLoading(`Loading KEGG pathway ${id}…`);
  try {
    const viewer = document.getElementById('kegg-pathway-viewer');
    const content = document.getElementById('kegg-pathway-content');
    if (viewer && content) {
      viewer.style.display = 'block';
      content.innerHTML = `
        <div class="pathway-viewer-header">
          <div>
            <span class="source-tag source-kegg">📦 KEGG</span>
            <strong style="margin-left:8px;color:var(--text-primary)">${id}</strong>
          </div>
          <a href="https://www.kegg.jp/pathway/${id}" target="_blank" rel="noopener noreferrer" class="tool-ext-link">KEGG ↗</a>
        </div>
        <div style="background:#fff;text-align:center;padding:8px">
          <img src="https://www.kegg.jp/kegg/pathway/${id.replace('path:','')}.png"
               alt="${id} pathway map" class="pathway-img"
               onerror="this.style.display='none';this.nextSibling.style.display='block'"/>
          <div style="display:none;padding:20px;color:#333">
            Pathway image unavailable — <a href="https://www.kegg.jp/pathway/${id}" target="_blank" rel="noopener noreferrer">View on KEGG ↗</a>
          </div>
        </div>`;
    }
    hideLoading();
    showToast(`KEGG pathway ${id} loaded`, 'success');
  } catch (e) {
    hideLoading(); showToast(e.message, 'error');
  }
}

/* ═══════════════════════════════════════════
   CAT 7 — REACTOME
═══════════════════════════════════════════ */
async function searchReactome() {
  const query   = document.getElementById('reactomeQuery')?.value.trim();
  const species = document.getElementById('reactomeSpecies')?.value || 'Homo sapiens';
  if (!query) { showToast('Enter pathway name', 'warning'); return; }
  BN.lastTool = 'reactome';
  showLoading('Searching Reactome…');
  try {
    const data = await apiFetch('reactome/search', { body: { query, species } });
    hideLoading();
    renderReactomeResults(data.results || []);
    showToast(`${data.results?.length || 0} Reactome pathways found`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-reactome', e.message, 'Reactome');
    showToast(e.message, 'error');
  }
}
function quickReactome(q) {
  const qi = document.getElementById('reactomeQuery');
  if (qi) qi.value = q;
  searchReactome();
}

function renderReactomeResults(results) {
  const container = document.getElementById('results-reactome');
  if (!container) return;
  if (!results.length) {
    container.innerHTML = emptyState('🗺️','No pathways found','Try a different search term.');
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'results-grid';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="source-tag source-reactome">📦 Reactome</div>
      <div class="result-title">${escHtml(r.title)}</div>
      <div class="result-id">${escHtml(r.id)}</div>
      <div class="result-desc">Type: ${escHtml(r.type||'Pathway')} · ${escHtml(r.species||'')}</div>
      <div class="result-actions">
        <a href="${r.link}" target="_blank" rel="noopener noreferrer" class="btn-result-pri" style="text-decoration:none">View Diagram ↗</a>
      </div>`;
    grid.appendChild(card);
  });
  container.innerHTML = ''; container.appendChild(grid);
}

/* ═══════════════════════════════════════════
   CAT 7 — CYTOSCAPE NETWORK
═══════════════════════════════════════════ */
async function buildCytoscapeNetwork() {
  const gene = document.getElementById('cytoGene')?.value.trim();
  if (!gene) { showToast('Enter a gene name', 'warning'); return; }
  showLoading(`Building network for ${gene}…`);
  try {
    const data = await apiFetch('string/partners', { body: { protein: gene, species: 9606, limit: 25 } });
    hideLoading();
    const partners = data.partners || [];
    document.getElementById('cytoscape-wrap').style.display = 'block';
    const canvas = document.getElementById('cytoscapeCanvas');
    if (canvas) renderSTRINGNetwork({ network: [] }, partners);
    showToast(`Network for ${gene} rendered`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-cytoscape', e.message, 'STRING/Cytoscape');
    showToast(e.message, 'error');
  }
}
function quickCytoscape(g) {
  const qi = document.getElementById('cytoGene');
  if (qi) qi.value = g;
  buildCytoscapeNetwork();
}

/* ═══════════════════════════════════════════
   CAT 8 — BIOCONDUCTOR
═══════════════════════════════════════════ */
async function searchBioconductor() {
  const query = document.getElementById('biocQuery')?.value.trim();
  if (!query) { showToast('Enter a package name or keyword', 'warning'); return; }
  showLoading('Searching Bioconductor…');
  try {
    const data = await apiFetch('bioconductor/search', { body: { query } });
    hideLoading();
    renderBiocResults(data.results || [], 'results-bioconductor', 'bioc');
    showToast(`${data.results?.length || 0} Bioconductor packages found`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-bioconductor', e.message, 'Bioconductor');
    showToast(e.message, 'error');
  }
}
function quickBioc(q) {
  const qi = document.getElementById('biocQuery');
  if (qi) qi.value = q;
  searchBioconductor();
}

function renderBiocResults(results, containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!results.length) {
    container.innerHTML = emptyState('📦','No packages found','Try a different search term.');
    return;
  }
  const sourceClass = type === 'bioc' ? 'source-bioc' : 'source-bioconda';
  const sourceName  = type === 'bioc' ? '📦 Bioconductor' : '📦 Bioconda';
  const grid = document.createElement('div');
  grid.className = 'results-grid';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="source-tag ${sourceClass}">${sourceName}</div>
      <div class="result-title">${escHtml(r.title || r.id)}</div>
      <div class="result-id">${escHtml(r.id)}</div>
      <div class="result-meta">
        ${r.version ? `<span class="result-meta-item">v${escHtml(r.version)}</span>` : ''}
        ${r.downloads ? `<span class="result-meta-item">⬇️ ${r.downloads.toLocaleString()}</span>` : ''}
      </div>
      <div class="result-desc">${escHtml((r.description||'').slice(0,160))}</div>
      <div class="result-actions">
        <a href="${r.link}" target="_blank" rel="noopener noreferrer" class="btn-result-pri" style="text-decoration:none">View Package ↗</a>
        ${type === 'bioconda' ? `<div class="code-block" style="margin-top:6px;font-size:0.72rem;padding:6px 10px">conda install -c bioconda ${escHtml(r.id)}</div>` : ''}
      </div>`;
    grid.appendChild(card);
  });
  container.innerHTML = ''; container.appendChild(grid);
}

/* ═══════════════════════════════════════════
   CAT 8 — BIOCONDA
═══════════════════════════════════════════ */
async function searchBioconda() {
  const query = document.getElementById('biocondaQuery')?.value.trim();
  if (!query) { showToast('Enter a package name', 'warning'); return; }
  showLoading('Searching Bioconda…');
  try {
    const data = await apiFetch('bioconda/search', { body: { query } });
    hideLoading();
    renderBiocResults(data.results || [], 'results-bioconda', 'bioconda');
    showToast(`${data.results?.length || 0} Bioconda packages found`, 'success');
  } catch (e) {
    hideLoading();
    showError('results-bioconda', e.message, 'Bioconda');
    showToast(e.message, 'error');
  }
}
function quickBioconda(q) {
  const qi = document.getElementById('biocondaQuery');
  if (qi) qi.value = q;
  searchBioconda();
}

/* ═══════════════════════════════════════════
   IGV
═══════════════════════════════════════════ */
let igvInitialized = false;
function initIGV() {
  if (igvInitialized) return;
  const container = document.getElementById('igv-container');
  if (!container) return;
  // Load IGV.js from CDN
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/igv@3.0.0/dist/igv.min.js';
  script.onload = () => {
    igvInitialized = true;
    const genome = document.getElementById('igvGenome')?.value || 'hg38';
    const locus  = document.getElementById('igvLocus')?.value || 'BRCA1';
    container.innerHTML = '';
    window.igv.createBrowser(container, {
      genome,
      locus,
      tracks: [{ name: 'Genes', type: 'annotation', format: 'gff3', displayMode: 'EXPANDED' }]
    }).then(browser => { BN.igvBrowser = browser; });
  };
  script.onerror = () => {
    container.innerHTML = `<div class="igv-loading"><div class="empty-icon">🔭</div><p>IGV.js failed to load. Check internet connection.</p><a href="https://igv.org/app/" target="_blank" rel="noopener noreferrer" class="galaxy-link-btn" style="margin-top:12px">Open IGV.js App ↗</a></div>`;
  };
  document.head.appendChild(script);
}

function navigateIGV() {
  const locus  = document.getElementById('igvLocus')?.value || 'BRCA1';
  const genome = document.getElementById('igvGenome')?.value || 'hg38';
  if (BN.igvBrowser) {
    BN.igvBrowser.search(locus);
  } else {
    initIGV();
  }
}



function setTheme(t) {
  applyTheme(t);
}

/* ═══════════════════════════════════════════
   RESULT MODAL
═══════════════════════════════════════════ */
function showResultModal(title, bodyHTML, data) {
  BN.lastResultData = data;
  const titleEl = document.getElementById('resultModalTitle');
  const bodyEl  = document.getElementById('resultModalBody');
  const overlay = document.getElementById('resultModal');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl)  bodyEl.innerHTML    = bodyHTML;
  if (overlay) overlay.classList.add('open');
}

function closeResultModal() {
  const overlay = document.getElementById('resultModal');
  if (overlay) overlay.classList.remove('open');
}


/* ═══════════════════════════════════════════
   UNIVERSAL RENDER
═══════════════════════════════════════════ */
/* ── internal store of all rendered result sets ── */
const _resultStore = {};   // containerId → full results array

function renderResults(results, containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!results.length) {
    container.innerHTML = emptyState('🔬', 'No results found', 'Try a different query or adjust your filters.');
    return;
  }

  // Store full set for client-side filtering
  _resultStore[containerId] = results;

  // Build unique source tags from the data
  const sources = [...new Set(results.map(r => r.source || type.toUpperCase()))];

  // Build unique organism list (for bio results)
  const organisms = [...new Set(results.map(r => r.organism).filter(Boolean))].slice(0, 8);

  // Determine sort options based on data fields
  const hasLength   = results.some(r => r.length);
  const hasOrganism = organisms.length > 0;

  const wrapId  = `filter-wrap-${containerId}`;
  const gridId  = `grid-${containerId}`;
  const countId = `count-${containerId}`;

  container.innerHTML = `
    <!-- ══ FILTER BAR ══ -->
    <div class="rf-bar" id="${wrapId}">
      <div class="rf-bar-top">
        <!-- Text filter -->
        <div class="rf-search-wrap">
          <span class="rf-search-icon">⌕</span>
          <input
            class="rf-search-input"
            id="rf-text-${containerId}"
            placeholder="Filter results…"
            oninput="applyResultFilters('${containerId}','${type}')"
            autocomplete="off"
          />
          <button class="rf-clear-btn" onclick="clearResultFilters('${containerId}','${type}')" title="Clear filters">✕</button>
        </div>

        <!-- Sort dropdown -->
        <select class="rf-sort-sel" id="rf-sort-${containerId}" onchange="applyResultFilters('${containerId}','${type}')">
          <option value="default">Sort: Relevance</option>
          <option value="az">Sort: A → Z</option>
          <option value="za">Sort: Z → A</option>
          ${hasLength ? '<option value="len-desc">Sort: Length ↓</option><option value="len-asc">Sort: Length ↑</option>' : ''}
        </select>

        <!-- Results count -->
        <div class="rf-count" id="${countId}">${results.length} results</div>
      </div>

      <!-- Source filter chips -->
      ${sources.length > 1 ? `
      <div class="rf-chips-row">
        <span class="rf-chips-label">Source:</span>
        <button class="rf-chip active" data-source="all" onclick="setSourceFilter('${containerId}','${type}',this,'all')">All</button>
        ${sources.map(s => `<button class="rf-chip" data-source="${escHtml(s)}" onclick="setSourceFilter('${containerId}','${type}',this,'${escHtml(s)}')">${escHtml(s)}</button>`).join('')}
      </div>` : ''}

      <!-- Organism filter chips (biology results) -->
      ${hasOrganism ? `
      <div class="rf-chips-row">
        <span class="rf-chips-label">Organism:</span>
        <button class="rf-chip active" data-org="all" onclick="setOrgFilter('${containerId}','${type}',this,'all')">All</button>
        ${organisms.map(o => `<button class="rf-chip rf-chip-org" data-org="${escHtml(o)}" onclick="setOrgFilter('${containerId}','${type}',this,'${escHtml(o)}')">${escHtml(o)}</button>`).join('')}
      </div>` : ''}
    </div>

    <!-- ══ RESULTS GRID ══ -->
    <div class="results-grid" id="${gridId}"></div>
  `;

  // Render initial grid
  _renderFilteredGrid(results, gridId, countId, results.length, type);
}

/* Apply all active filters and re-render the grid */
function applyResultFilters(containerId, type) {
  const all = _resultStore[containerId] || [];
  if (!all.length) return;

  const textEl   = document.getElementById(`rf-text-${containerId}`);
  const sortEl   = document.getElementById(`rf-sort-${containerId}`);
  const gridEl   = document.getElementById(`grid-${containerId}`);
  const countEl  = document.getElementById(`count-${containerId}`);
  const wrapEl   = document.getElementById(`filter-wrap-${containerId}`);

  const text = (textEl?.value || '').toLowerCase().trim();
  const sort = sortEl?.value || 'default';

  // Active source chip
  const srcChip = wrapEl?.querySelector('.rf-chip[data-source].active');
  const srcFilter = srcChip?.dataset.source || 'all';

  // Active organism chip
  const orgChip = wrapEl?.querySelector('.rf-chip[data-org].active');
  const orgFilter = orgChip?.dataset.org || 'all';

  let filtered = all.filter(r => {
    // Text match across title, description, accession, id, organism
    if (text) {
      const blob = [r.title, r.name, r.id, r.accession, r.description, r.summary, r.organism]
        .filter(Boolean).join(' ').toLowerCase();
      if (!blob.includes(text)) return false;
    }
    // Source filter
    if (srcFilter !== 'all') {
      const rs = (r.source || type).toUpperCase();
      if (rs !== srcFilter) return false;
    }
    // Organism filter
    if (orgFilter !== 'all') {
      if (r.organism !== orgFilter) return false;
    }
    return true;
  });

  // Sort
  if (sort === 'az') filtered.sort((a,b) => (a.title||a.name||'').localeCompare(b.title||b.name||''));
  else if (sort === 'za') filtered.sort((a,b) => (b.title||b.name||'').localeCompare(a.title||a.name||''));
  else if (sort === 'len-desc') filtered.sort((a,b) => (Number(b.length)||0) - (Number(a.length)||0));
  else if (sort === 'len-asc')  filtered.sort((a,b) => (Number(a.length)||0) - (Number(b.length)||0));

  _renderFilteredGrid(filtered, `grid-${containerId}`, `count-${containerId}`, all.length, type);
}

/* Set source chip active state and re-filter */
function setSourceFilter(containerId, type, clickedBtn, value) {
  const wrapEl = document.getElementById(`filter-wrap-${containerId}`);
  wrapEl?.querySelectorAll('.rf-chip[data-source]').forEach(c => c.classList.remove('active'));
  clickedBtn.classList.add('active');
  applyResultFilters(containerId, type);
}

/* Set organism chip active state and re-filter */
function setOrgFilter(containerId, type, clickedBtn, value) {
  const wrapEl = document.getElementById(`filter-wrap-${containerId}`);
  wrapEl?.querySelectorAll('.rf-chip[data-org]').forEach(c => c.classList.remove('active'));
  clickedBtn.classList.add('active');
  applyResultFilters(containerId, type);
}

/* Clear all filters */
function clearResultFilters(containerId, type) {
  const textEl = document.getElementById(`rf-text-${containerId}`);
  const sortEl = document.getElementById(`rf-sort-${containerId}`);
  if (textEl) textEl.value = '';
  if (sortEl) sortEl.value = 'default';
  const wrapEl = document.getElementById(`filter-wrap-${containerId}`);
  wrapEl?.querySelectorAll('.rf-chip[data-source]').forEach((c,i) => c.classList.toggle('active', i===0));
  wrapEl?.querySelectorAll('.rf-chip[data-org]').forEach((c,i) => c.classList.toggle('active', i===0));
  applyResultFilters(containerId, type);
}

/* Render cards into the grid element */
function _renderFilteredGrid(results, gridId, countId, total, type) {
  const gridEl  = document.getElementById(gridId);
  const countEl = document.getElementById(countId);
  if (!gridEl) return;

  if (countEl) {
    const shown = results.length;
    countEl.textContent = shown === total
      ? `${total} results`
      : `${shown} of ${total} results`;
    countEl.classList.toggle('rf-count-filtered', shown !== total);
  }

  if (!results.length) {
    gridEl.innerHTML = `
      <div class="rf-empty">
        <span class="rf-empty-icon">🔍</span>
        <div class="rf-empty-title">No matching results</div>
        <div class="rf-empty-sub">Try changing your filters or search term</div>
        <button class="rf-empty-clear" onclick="clearResultFilters('${gridId.replace('grid-','')}','${type}')">Clear Filters</button>
      </div>`;
    return;
  }

  gridEl.innerHTML = '';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    const sc = sourceClass(r.source || type);
    card.onclick = () => showResultModal(r.title || r.id, buildGenericModal(r), r);
    card.innerHTML = `
      <div class="source-tag ${sc}">📦 ${escHtml(r.source || type.toUpperCase())}</div>
      <div class="result-title">${escHtml(r.title || r.name || r.id || 'Unknown')}</div>
      <div class="result-id">${escHtml(r.accession || r.id || '')}</div>
      ${r.organism ? `<div class="result-meta"><span class="result-meta-item">🦠 ${escHtml(r.organism)}</span>${r.length ? `<span class="result-meta-item">📏 ${r.length}</span>` : ''}</div>` : ''}
      <div class="result-desc">${escHtml((r.description || r.summary || r.function || '').slice(0,160))}</div>
      <div class="result-actions">
        <button class="btn-result-pri" onclick="event.stopPropagation();showResultModal('${escHtml(r.title||r.id||'')}',buildGenericModal(BN.lastResults?.find(x=>x.id==='${r.id}')||{}),BN.lastResults?.find(x=>x.id==='${r.id}')||{})">Details</button>
        ${r.link ? `<a href="${r.link}" target="_blank" rel="noopener noreferrer" class="btn-result-sec" style="text-decoration:none" onclick="event.stopPropagation()">View ↗</a>` : ''}
      </div>`;
    gridEl.appendChild(card);
  });
}


function buildGenericModal(r) {
  if (!r) return '<p>No data available</p>';
  return Object.entries(r)
    .filter(([k,v]) => v && k !== 'raw' && typeof v !== 'object' && k !== 'link')
    .map(([k,v]) => `<div class="info-row"><div class="info-label-sm">${escHtml(k)}</div><div class="info-val">${escHtml(String(v).slice(0,500))}</div></div>`)
    .join('') +
    (r.link ? `<div style="margin-top:12px"><a href="${r.link}" target="_blank" rel="noopener noreferrer" class="btn-result-pri" style="text-decoration:none">View Online ↗</a></div>` : '');
}

function sourceClass(source) {
  if (!source) return 'source-ncbi';
  const s = source.toLowerCase();
  if (s.includes('ncbi'))        return 'source-ncbi';
  if (s.includes('uniprot'))     return 'source-uniprot';
  if (s.includes('pdb'))         return 'source-pdb';
  if (s.includes('kegg'))        return 'source-kegg';
  if (s.includes('ebi') || s.includes('embl') || s.includes('interpro') || s.includes('clustal') || s.includes('phyml')) return 'source-ebi';
  if (s.includes('reactome'))    return 'source-reactome';
  if (s.includes('string'))      return 'source-string';
  if (s.includes('alphafold'))   return 'source-alphafold';
  if (s.includes('bioconductor'))return 'source-bioc';
  if (s.includes('bioconda'))    return 'source-bioconda';
  if (s.includes('ddbj'))        return 'source-ddbj';
  if (s.includes('ucsc'))        return 'source-ucsc';
  if (s.includes('galaxy'))      return 'source-galaxy';
  return 'source-ncbi';
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function emptyState(icon, title, desc) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${escHtml(title)}</h3><p>${escHtml(desc)}</p></div>`;
}

function showError(containerId, msg, source) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Error from ${escHtml(source)}</h3>
      <p>${escHtml(msg)}</p>
      <p style="margin-top:8px;font-size:0.75rem;color:var(--text-muted)">Make sure the BioNexus server is running: <code>npm start</code></p>
    </div>`;
  }
}

function showLoading(msg = 'Loading…') {
  const overlay = document.getElementById('loadingOverlay');
  const msgEl   = document.getElementById('loadingMsg');
  if (overlay) overlay.classList.add('active');
  if (msgEl)   msgEl.textContent = msg;
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

