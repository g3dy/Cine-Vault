  // ── API credentials ───────────────────────────────────────
  const TMDB_API_KEY = '9ff020dad7031725766a55fd00fce072';
  const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5ZmYwMjBkYWQ3MDMxNzI1NzY2YTU1ZmQwMGZjZTA3MiIsIm5iZiI6MTc3NTE4MDk2MS4zOTY5OTk4LCJzdWIiOiI2OWNmMWNhMTc0YTA2MTZkYjgyZjcyZTYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.VcldAafkzRZjx2vvD88sOliimEt_ysG63hguvL0uItc';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_HDR = {
    'Authorization': `Bearer ${TMDB_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const WM_KEY = '6t3PFCcYIvCi61PZdP6kMRHpIdn2oc0TmQ1fk2Hl';
  const WM_BASE = 'https://api.watchmode.com/v1';
  const IMG_W500   = 'https://image.tmdb.org/t/p/w500';
  const IMG_ORIG   = 'https://image.tmdb.org/t/p/original';

  function tmdbUrl(path) {
    const [pathname, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    params.set('api_key', TMDB_API_KEY);
    return `${TMDB_BASE}${pathname}?${params.toString()}`;
  }

  const PLATFORMS = {
    203:{cls:'p-netflix',label:'Netflix',icon:'N'}, 26:{cls:'p-prime',label:'Prime Video',icon:'P'},
    372:{cls:'p-disney',label:'Disney+',icon:'D+'}, 387:{cls:'p-hbo',label:'Max',icon:'M'},
    157:{cls:'p-hulu',label:'Hulu',icon:'H'}, 371:{cls:'p-apple',label:'Apple TV+',icon:'A'},
    389:{cls:'p-peacock',label:'Peacock',icon:'Pc'}, 444:{cls:'p-paramount',label:'Paramount+',icon:'P+'},
    636:{cls:'p-mubi',label:'MUBI',icon:'Mu'}
  };
  const TYPE_LABEL = { sub:'Sub', free:'Free', rent:'Rent', buy:'Buy', tve:'Live TV' };
 
  let heroMovie = null;
  const wmCache = {};
 
  // Grid state
  let gridMode = null; // 'originals'|'trending'|'toprated'|'genre'|'search'
  let gridType = 'movie';
  let gridGenreId = null;
  let gridNetworkId = null;
  let gridPage = 1;
  let gridQuery = '';
 
  // ── Boot ─────────────────────────────────────────────────
  window.onload = async () => {
    setupNavScroll();
    await Promise.all([loadOriginals(), loadTrending(), loadTopRated(), loadGenres()]);
    setTimeout(() => document.getElementById('loader').classList.add('hidden'), 600);
  };
 
  // ── TMDB helper ──────────────────────────────────────────
  async function tmdb(path) {
    try {
      const r = await fetch(tmdbUrl(path), { headers: TMDB_HDR });
      const d = await r.json();
      return d;
    } catch(e) { return {}; }
  }
 
  async function getWatchmodeId(tmdbId, type) {
    const field = type === 'tv' ? 'tmdb_tv_id' : 'tmdb_movie_id';
    try {
      const r = await fetch(`${WM_BASE}/search/?apiKey=${encodeURIComponent(WM_KEY)}&search_field=${field}&search_value=${encodeURIComponent(tmdbId)}`);
      const d = await r.json();
      return d.title_results?.[0]?.id || null;
    } catch(e) { return null; }
  }
 
  async function fetchStreaming(tmdbId, type) {
    const key = `${type}:${tmdbId}`;
    if (key in wmCache) return wmCache[key];
    try {
      const wmId = await getWatchmodeId(tmdbId, type);
      if (!wmId) { wmCache[key] = null; return null; }
      const r = await fetch(`${WM_BASE}/title/${encodeURIComponent(wmId)}/sources/?apiKey=${encodeURIComponent(WM_KEY)}&regions=US`);
      const s = await r.json();
      wmCache[key] = Array.isArray(s) ? s : null;
      return wmCache[key];
    } catch(e) { wmCache[key] = null; return null; }
  }
 
  function renderStreamingButtons(sources, container) {
    container.innerHTML = '';
    if (!sources || !sources.length) { container.innerHTML = '<div class="no-streaming">Not currently streaming in the US.</div>'; return; }
    const order = ['sub','free','tve','rent','buy'];
    const sorted = [...sources].sort((a,b) => order.indexOf(a.type)-order.indexOf(b.type));
    const seen = new Set();
    sorted.forEach(src => {
      if (seen.has(src.source_id)) return; seen.add(src.source_id);
      const p = PLATFORMS[src.source_id] || { cls:'p-default', label:src.name||'Watch', icon:'▶' };
      const lbl = TYPE_LABEL[src.type] || '';
      let leaving = '';
      if (src.leaving && src.leaving > 0) {
        const days = Math.ceil((src.leaving*1000 - Date.now()) / 86400000);
        if (days > 0 && days <= 30) leaving = `<span class="leaving-tag">Leaves in ${days}d</span>`;
      }
      const a = document.createElement('a');
      a.href = src.web_url||'#'; a.target='_blank'; a.rel='noopener noreferrer';
      a.className = `stream-btn ${p.cls}`;
      a.innerHTML = `<span class="s-icon">${p.icon}</span><span>${p.label}${lbl?' · '+lbl:''}${leaving}</span>`;
      container.appendChild(a);
    });
    if (!container.children.length) container.innerHTML = '<div class="no-streaming">Not currently streaming in the US.</div>';
  }
 
  async function attachBadges(card, id, type, platformWrap) {
    const sources = await fetchStreaming(id, type);
    if (!sources?.length) return;
    const wrap = platformWrap || card.querySelector('.card-platforms,.gc-platforms');
    if (!wrap) return;
    const seen = new Set();
    sources.filter(s => s.type==='sub'||s.type==='free').forEach(src => {
      if (seen.size >= 3 || seen.has(src.source_id)) return;
      seen.add(src.source_id);
      const p = PLATFORMS[src.source_id];
      if (!p) return;
      const dot = document.createElement('div');
      dot.className = `platform-dot ${p.cls}`; dot.title = p.label; dot.textContent = p.icon;
      wrap.appendChild(dot);
    });
  }
 
  // ── Load sections (horizontal rows) ──────────────────────
  async function loadOriginals() {
    const d = await tmdb('/discover/tv?with_networks=213&language=en-US&sort_by=popularity.desc');
    const row = document.getElementById('originals-row');
    row.innerHTML = '';
    (d.results||[]).slice(0,14).forEach((m,i) => {
      if (!m.backdrop_path) return;
      const card = document.createElement('div');
      card.className = 'backdrop-card';
      card.innerHTML = `${i<3?'<div class="badge-new">NEW</div>':''}<img src="${IMG_W500}${m.backdrop_path}" alt="${m.name}" loading="lazy"/><div class="bd-overlay"></div><div class="bd-info"><h4>${m.name}</h4><div class="meta">★ ${m.vote_average?.toFixed(1)||'—'} · TV Series</div></div>`;
      card.onclick = () => openModal(m, 'tv');
      row.appendChild(card);
    });
  }
 
  async function loadTrending() {
    const d = await tmdb('/trending/movie/week?language=en-US');
    const row = document.getElementById('trending-row');
    row.innerHTML = '';
    if (d.results?.length && !heroMovie) setHero(d.results[0]);
    (d.results||[]).slice(0,18).forEach(m => {
      if (!m.poster_path) return;
      const card = makePosterCard(m,'movie');
      row.appendChild(card);
      attachBadges(card, m.id, 'movie');
    });
  }
 
  async function loadTopRated() {
    const d = await tmdb('/movie/top_rated?language=en-US&page=1');
    const row = document.getElementById('toprated-row');
    row.innerHTML = '';
    (d.results||[]).slice(0,18).forEach(m => {
      if (!m.poster_path) return;
      const card = makePosterCard(m,'movie');
      row.appendChild(card);
      attachBadges(card, m.id, 'movie');
    });
  }
 
  async function loadGenres() {
    try {
      const r = await fetch(tmdbUrl('/genre/movie/list?language=en-US'), {headers:TMDB_HDR});
      const d = await r.json();
      const wrap = document.getElementById('genres');
      const setActive = pill => { document.querySelectorAll('.genre-pill').forEach(p=>p.classList.remove('active')); pill.classList.add('active'); };
      const all = document.createElement('div');
      all.className='genre-pill active'; all.textContent='All';
      all.onclick = () => { setActive(all); showHome(); };
      wrap.appendChild(all);
      d.genres.slice(0,12).forEach(g => {
        const p = document.createElement('div');
        p.className='genre-pill'; p.textContent=g.name;
        p.onclick = () => { setActive(p); openGridView('genre', g.name, 'movie', g.id, null); };
        wrap.appendChild(p);
      });
    } catch(e) {}
  }
 
  // ── Grid View ────────────────────────────────────────────
  async function openGridView(mode, titleText, type, genreId, networkId) {
    gridMode = mode; gridType = type; gridGenreId = genreId; gridNetworkId = networkId; gridPage = 1;
    // Render title
    const parts = titleText.split(' ');
    const last = parts.pop();
    document.getElementById('gridViewTitle').innerHTML = parts.length ? `${parts.join(' ')} <span>${last}</span>` : `<span>${last}</span>`;
    document.getElementById('movieGrid').innerHTML = '';
    document.getElementById('gridLoadMore').disabled = false;
    // Show grid, hide main
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('grid-view').classList.add('open');
    window.scrollTo({top:0, behavior:'smooth'});
    await fetchAndRenderGrid(true);
  }
 
  function closeGridView() {
    document.getElementById('grid-view').classList.remove('open');
    document.getElementById('main-content').style.display = '';
    // Reset genre pills
    document.querySelectorAll('.genre-pill').forEach((p,i) => { p.classList.toggle('active', i===0); });
    window.scrollTo({top:0});
  }
 
  function showHome() {
    closeGridView();
  }
 
  async function fetchAndRenderGrid(reset=false) {
    const btn = document.getElementById('gridLoadMore');
    btn.disabled = true; btn.textContent = 'Loading...';
    let url = '';
    if (gridMode === 'originals') {
      url = `/discover/tv?with_networks=${gridNetworkId}&language=en-US&sort_by=popularity.desc&page=${gridPage}`;
    } else if (gridMode === 'trending') {
      url = `/trending/movie/week?language=en-US&page=${gridPage}`;
    } else if (gridMode === 'toprated') {
      url = `/movie/top_rated?language=en-US&page=${gridPage}`;
    } else if (gridMode === 'genre') {
      url = `/discover/movie?with_genres=${gridGenreId}&language=en-US&sort_by=popularity.desc&page=${gridPage}`;
    } else if (gridMode === 'search') {
      url = `/search/multi?query=${encodeURIComponent(gridQuery)}&language=en-US&page=${gridPage}`;
    }
    const d = await tmdb(url);
    const results = (d.results||[]).filter(m => m.poster_path);
    const grid = document.getElementById('movieGrid');
    results.forEach(m => {
      const type = m.media_type === 'tv' || gridMode === 'originals' ? 'tv' : 'movie';
      grid.appendChild(makeGridCard(m, type));
    });
    gridPage++;
    const hasMore = gridPage <= (d.total_pages||1);
    btn.disabled = !hasMore;
    btn.textContent = hasMore ? 'Load More' : 'No more results';
  }
 
  async function loadMoreGrid() {
    await fetchAndRenderGrid(false);
  }
 
  function makeGridCard(m, type='movie') {
    const card = document.createElement('div');
    card.className = 'grid-card';
    const title = m.title || m.name || '';
    card.innerHTML = `
      <img src="${IMG_W500}${m.poster_path}" alt="${title}" loading="lazy"/>
      <div class="gc-platforms"></div>
      <div class="gc-overlay"></div>
      <div class="gc-info"><h4>${title}</h4><div class="gc-star">★ ${m.vote_average?.toFixed(1)||'—'}</div></div>`;
    card.onclick = () => openModal(m, type);
    attachBadges(card, m.id, type, card.querySelector('.gc-platforms'));
    return card;
  }
 
  // ── Poster card (horizontal) ─────────────────────────────
  function makePosterCard(m, type) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    const title = m.title || m.name || '';
    card.innerHTML = `
      <img src="${IMG_W500}${m.poster_path}" alt="${title}" loading="lazy"/>
      <div class="card-platforms"></div>
      <div class="card-overlay"></div>
      <button class="card-play-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
      <div class="card-info"><h4>${title}</h4><div class="star">★ ${m.vote_average?.toFixed(1)||'—'}</div></div>`;
    card.onclick = () => openModal(m, type);
    return card;
  }
 
  // ── Hero ─────────────────────────────────────────────────
  function setHero(m) {
    heroMovie = m;
    document.getElementById('heroTitle').textContent  = (m.title||m.name||'').toUpperCase();
    document.getElementById('heroDesc').textContent   = (m.overview||'').slice(0,200)+(m.overview?.length>200?'...':'');
    document.getElementById('heroRating').textContent = `★ ${m.vote_average?.toFixed(1)||'—'}`;
    document.getElementById('heroYear').textContent   = m.release_date?.slice(0,4)||m.first_air_date?.slice(0,4)||'—';
    if (m.backdrop_path) document.getElementById('heroBg').style.backgroundImage = `url('${IMG_ORIG}${m.backdrop_path}')`;
  }
 
  // ── Trailer helpers ──────────────────────────────────────
  const trailerCache = {};
 
  async function fetchTrailers(tmdbId, type) {
    const key = `${type}:${tmdbId}`;
    if (key in trailerCache) return trailerCache[key];
    try {
      const endpoint = type === 'tv'
        ? `/tv/${tmdbId}/videos?language=en-US`
        : `/movie/${tmdbId}/videos?language=en-US`;
      const d = await tmdb(endpoint);
      const videos = (d.results || []).filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip'));
      trailerCache[key] = videos;
      return videos;
    } catch(e) { trailerCache[key] = []; return []; }
  }
 
  function renderTrailers(videos, movieTitle) {
    const strip = document.getElementById('trailerStrip');
    strip.innerHTML = '';
    if (!videos || !videos.length) {
      strip.innerHTML = '<div class="no-trailer">No trailers available.</div>';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'trailer-strip';
    videos.slice(0, 6).forEach(v => {
      const thumb = document.createElement('div');
      thumb.className = 'trailer-thumb';
      thumb.title = v.name;
      thumb.innerHTML = `
        <img src="https://img.youtube.com/vi/${v.key}/mqdefault.jpg" alt="${v.name}" loading="lazy"/>
        <div class="tt-play">
          <div class="tt-play-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#e5383b"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
        <div class="tt-name">${v.name}</div>`;
      thumb.onclick = () => playTrailer(v.key, v.name, movieTitle);
      wrap.appendChild(thumb);
    });
    strip.appendChild(wrap);
  }
 
  function playTrailer(youtubeKey, videoName, movieTitle) {
    document.getElementById('trailerPlayerTitle').textContent = `${movieTitle} — ${videoName}`;
    document.getElementById('trailerFrame').src =
      `https://www.youtube.com/embed/${youtubeKey}?autoplay=1&rel=0&modestbranding=1`;
    document.getElementById('trailerOverlay').classList.add('open');
  }
 
  function closeTrailer() {
    document.getElementById('trailerOverlay').classList.remove('open');
    document.getElementById('trailerFrame').src = '';
  }
 
 
  // ── SuperEmbed Watch Player ───────────────────────────────
  let currentWatchMovie = null;
  let currentWatchType  = 'movie';
  let watchSeason  = 1;
  let watchEpisode = 1;
  let watchSeasonData = [];
 
  function openWatchPlayer() {
    if (!currentWatchMovie) return;
    const title = currentWatchMovie.title || currentWatchMovie.name || '';
    document.getElementById('watchPlayerTitle').textContent = title;
    document.getElementById('watchLoading').classList.remove('hidden');
 
    if (currentWatchType === 'tv') {
      document.getElementById('watchEpisodeControls').style.display = 'flex';
      loadTVSeasons(currentWatchMovie.id);
    } else {
      document.getElementById('watchEpisodeControls').style.display = 'none';
      loadWatchFrame(currentWatchMovie.id, 'movie');
    }
    document.getElementById('watchOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
 
  // ── Embed sources (tried in order) ──────────────────────
  const EMBED_SOURCES = [
    { name:'VidSrc',     movie: id=>`https://vidsrc.to/embed/movie/${id}`,          tv:(id,s,e)=>`https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
    { name:'VidSrc.me',  movie: id=>`https://vidsrc.me/embed/movie?tmdb=${id}`,     tv:(id,s,e)=>`https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
    { name:'2embed',     movie: id=>`https://www.2embed.cc/embed/${id}`,             tv:(id,s,e)=>`https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
    { name:'MultiEmbed', movie: id=>`https://multiembed.mov/?video_id=${id}&tmdb=1`, tv:(id,s,e)=>`https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` }
  ];
  let currentSourceIndex = 0;
  let currentTmdbId = null, currentMediaType = 'movie', currentSeason = 1, currentEpisode = 1;
 
  function loadWatchFrame(tmdbId, type, season, episode) {
    currentTmdbId   = tmdbId;
    currentMediaType = type;
    currentSeason   = season || 1;
    currentEpisode  = episode || 1;
    currentSourceIndex = 0;
    loadSource();
  }
 
  function loadSource() {
    const frame   = document.getElementById('watchFrame');
    const loading = document.getElementById('watchLoading');
    const source  = EMBED_SOURCES[currentSourceIndex];
    loading.classList.remove('hidden');
    loading.innerHTML = `<div class="spin-ring" style="width:28px;height:28px;border-width:3px"></div><span>Loading ${source.name}...</span>`;
    frame.src = '';
    const src = currentMediaType === 'tv'
      ? source.tv(currentTmdbId, currentSeason, currentEpisode)
      : source.movie(currentTmdbId);
    frame.src = src;
    frame.onload = () => loading.classList.add('hidden');
    renderSourceButtons();
  }
 
  function switchSource(index) {
    currentSourceIndex = index;
    loadSource();
  }
 
  function renderSourceButtons() {
    const wrap = document.getElementById('watchSourceBtns');
    if (!wrap) return;
    wrap.innerHTML = EMBED_SOURCES.map((s, i) =>
      `<button onclick="switchSource(${i})"
        style="background:${i===currentSourceIndex?'var(--red)':'rgba(255,255,255,0.08)'};
        border:0.5px solid ${i===currentSourceIndex?'var(--red)':'rgba(255,255,255,0.15)'};
        color:#fff;padding:0.3rem 0.75rem;border-radius:3px;
        font-family:var(--font-body);font-size:0.75rem;cursor:pointer;transition:background 0.2s">
        ${s.name}</button>`
    ).join('');
  }
 
  async function loadTVSeasons(tmdbId) {
    try {
      const d = await tmdb(`/tv/${tmdbId}?language=en-US`);
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      watchSeasonData = seasons;
      const sel = document.getElementById('watchSeason');
      sel.innerHTML = seasons.map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`).join('');
      watchSeason = 1;
      sel.value = 1;
      await loadEpisodesForSeason(tmdbId, 1);
    } catch(e) {}
  }
 
  async function loadEpisodesForSeason(tmdbId, seasonNum) {
    try {
      const d = await tmdb(`/tv/${tmdbId}/season/${seasonNum}?language=en-US`);
      const eps = d.episodes || [];
      const sel = document.getElementById('watchEpisode');
      sel.innerHTML = eps.map(e => `<option value="${e.episode_number}">Ep ${e.episode_number}: ${e.name}</option>`).join('');
      watchEpisode = 1;
      sel.value = 1;
      loadWatchFrame(currentWatchMovie.id, 'tv', seasonNum, 1);
    } catch(e) {}
  }
 
  async function onSeasonChange() {
    watchSeason = parseInt(document.getElementById('watchSeason').value);
    document.getElementById('watchLoading').classList.remove('hidden');
    await loadEpisodesForSeason(currentWatchMovie.id, watchSeason);
  }
 
  function onEpisodeChange() {
    watchEpisode = parseInt(document.getElementById('watchEpisode').value);
    document.getElementById('watchLoading').classList.remove('hidden');
    loadWatchFrame(currentWatchMovie.id, 'tv', watchSeason, watchEpisode);
  }
 
  function closeWatchPlayer() {
    document.getElementById('watchOverlay').classList.remove('open');
    // Delay clearing src so iframe unloads cleanly
    setTimeout(() => { document.getElementById('watchFrame').src = ''; }, 200);
    // If modal is still open keep body locked, else unlock
    if (!document.getElementById('modalOverlay').classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }
 
  // ── Modal ─────────────────────────────────────────────────
  async function openModal(m, type='movie') {
    if (!m) return;
    currentWatchMovie = m;
    currentWatchType  = type;
    const title = m.title||m.name||'';
    const imgPath = m.backdrop_path||m.poster_path;
    document.getElementById('modalTitle').textContent    = title;
    document.getElementById('modalImg').src              = imgPath?`${IMG_W500}${imgPath}`:'';
    document.getElementById('modalImg').alt              = title;
    document.getElementById('modalOverview').textContent = m.overview||'No description available.';
    document.getElementById('modalMeta').innerHTML = `
      <span class="rating">★ ${m.vote_average?.toFixed(1)||'N/A'}</span>
      <span>${m.release_date?.slice(0,4)||m.first_air_date?.slice(0,4)||''}</span>
      <span>${type==='tv'?'TV Series':'Movie'}</span>
      ${m.adult?'<span style="color:var(--red)">18+</span>':''}`;
    // Reset loading states
    document.getElementById('trailerStrip').innerHTML =
      '<div class="trailer-loading"><div class="spin-ring"></div>Loading trailers...</div>';
    document.getElementById('streamingGrid').innerHTML =
      '<div class="streaming-loading"><div class="spin-ring"></div>Checking Watchmode...</div>';
    document.getElementById('modalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    // Fetch trailers and streaming in parallel
    const [videos, sources] = await Promise.all([
      fetchTrailers(m.id, type),
      fetchStreaming(m.id, type)
    ]);
    renderTrailers(videos, title);
    renderStreamingButtons(sources, document.getElementById('streamingGrid'));
  }
 
  function closeModal() {
    closeTrailer();
    // Close watch player without it re-locking body
    document.getElementById('watchOverlay').classList.remove('open');
    setTimeout(() => { document.getElementById('watchFrame').src = ''; }, 200);
    document.getElementById('modalOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  function handleOverlayClick(e) { if (e.target===document.getElementById('modalOverlay')) closeModal(); }
  // ── Escape key handler ───────────────────────────────────
  function handleEscape() {
    const wo = document.getElementById('watchOverlay');
    const to = document.getElementById('trailerOverlay');
    const mo = document.getElementById('modalOverlay');
    if (wo.classList.contains('open')) { closeWatchPlayer(); }
    else if (to.classList.contains('open')) { closeTrailer(); }
    else if (mo.classList.contains('open')) { closeModal(); }
  }
 
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') handleEscape();
  });
 
  // When iframe gets focus, keyboard events go to it instead of the page.
  // Fix: listen on window blur — when our page loses focus to an iframe,
  // refocus the window so ESC still works.
  window.addEventListener('blur', () => {
    // Small delay to let the iframe finish loading before we check
    setTimeout(() => {
      const wo = document.getElementById('watchOverlay');
      const to = document.getElementById('trailerOverlay');
      if (wo.classList.contains('open') || to.classList.contains('open')) {
        window.focus();
      }
    }, 100);
  });
 
  // Also catch ESC via the float close button visibility as fallback —
  // overlay close buttons always work even when iframe is focused.
 
  // ── Row scroll ────────────────────────────────────────────
  function scrollRow(id, dir) { document.getElementById(id).scrollBy({left:dir*480,behavior:'smooth'}); }
 
  // ── Navbar ────────────────────────────────────────────────
  function setupNavScroll() {
    window.addEventListener('scroll', () => {
      document.getElementById('navbar').classList.toggle('scrolled', window.scrollY>60);
    });
  }
 
  // ── Search with live suggestions ─────────────────────────
  let searchTimer;
  const searchInput = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('suggestions');
 
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    const q = this.value.trim();
    if (!q) { closeSuggestions(); return; }
    searchTimer = setTimeout(() => fetchSuggestions(q), 280);
  });
 
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const q = this.value.trim();
      if (q) { closeSuggestions(); doGridSearch(q); }
    }
    if (e.key === 'Escape') { closeSuggestions(); this.value=''; }
  });
 
  // Close suggestions when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-wrap')) closeSuggestions();
  });
 
  function closeSuggestions() {
    suggestionsBox.classList.remove('open');
    suggestionsBox.innerHTML = '';
  }
 
  async function fetchSuggestions(q) {
    try {
      const path = `/search/multi?query=${encodeURIComponent(q)}&language=en-US&page=1`;
      const r = await fetch(tmdbUrl(path), {headers:TMDB_HDR});
      const d = await r.json();
      const results = (d.results||[]).filter(m => m.media_type !== 'person' && (m.poster_path||m.backdrop_path)).slice(0,6);
      if (!results.length) { closeSuggestions(); return; }
      suggestionsBox.innerHTML = '';
      results.forEach(m => {
        const title = m.title||m.name||'';
        const year  = (m.release_date||m.first_air_date||'').slice(0,4);
        const type  = m.media_type==='tv' ? 'tv' : 'movie';
        const item  = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          ${m.poster_path
            ? `<img class="suggestion-thumb" src="${IMG_W500}${m.poster_path}" alt="${title}" loading="lazy"/>`
            : `<div class="suggestion-thumb-placeholder">No img</div>`}
          <div class="suggestion-info">
            <div class="suggestion-title">${title}</div>
            <div class="suggestion-meta">${year}${year?'  ·  ':''}<span class="suggestion-rating">★ ${m.vote_average?.toFixed(1)||'—'}</span></div>
          </div>
          <span class="suggestion-type">${type==='tv'?'TV':'Movie'}</span>`;
        item.onclick = () => {
          closeSuggestions();
          searchInput.value = '';
          openModal(m, type);
        };
        suggestionsBox.appendChild(item);
      });
      // Footer: "See all results"
      const footer = document.createElement('div');
      footer.className = 'suggestions-footer';
      footer.textContent = `See all results for "${q}" →`;
      footer.onclick = () => { closeSuggestions(); searchInput.value=''; doGridSearch(q); };
      suggestionsBox.appendChild(footer);
      suggestionsBox.classList.add('open');
    } catch(e) { closeSuggestions(); }
  }
 
  async function doGridSearch(q) {
    gridQuery = q;
    gridMode  = 'search';
    gridType  = 'movie';
    gridPage  = 1;
    document.getElementById('gridViewTitle').innerHTML = `Results for <span>"${q}"</span>`;
    document.getElementById('movieGrid').innerHTML = '';
    document.getElementById('gridLoadMore').disabled = false;
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('grid-view').classList.add('open');
    window.scrollTo({top:0, behavior:'smooth'});
    await fetchAndRenderGrid(true);
  }
