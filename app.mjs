import {STORAGE_KEY, DAILY_LIMIT_ENABLED, BASE_EDITION, editionKey, freshState, normalizeState, dailyUsage, dayKey, availableNeighbors, chooseOrigin, discover, practicePool, expeditionPool, startNewExpedition, clearAllProgress} from './game.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const shuffle = list => { const out=[...list]; for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];} return out; };
let geography, content, photoCatalog = {}, municipalities, eligible, state, selected = null, viewport, session = null, lastFocus = null;
let toastTimer, tipTimer, storageWarning = false, dragging = false, pointer = null, collectionFilter = 'all';
const map = $('#map'), dialog = $('#dialog');

const BUILD_VERSION='20261019-1';
async function loadJson(path){const sep=path.includes('?')?'&':'?';const response=await fetch(`${path}${sep}v=${BUILD_VERSION}`,{cache:'no-store'});if(!response.ok)throw new Error(`No se pudo cargar ${path}`);return response.json();}
function assetSrc(p,type){return p?.[type+'Data']||p?.[type]||'';}
function photoEntry(id){return photoCatalog?.[id]||null;}
function photoUrl(id){const photo=photoEntry(id);return photo?.fileName?`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(photo.fileName)}`:'';}
function photoCredit(id){const photo=photoEntry(id);return photo?`${photo.author||'Autor desconocido'} · ${photo.license||'Licencia pendiente'}`:'';}
function singularityText(p){return typeof p?.singularity==='string'?p.singularity:(p?.singularity?.text||'');}
function excerpt(text,max=132){const t=String(text||'').replace(/\s+/g,' ').trim();if(t.length<=max)return t;const cut=t.slice(0,max);const last=cut.lastIndexOf(' ');return (last>60?cut.slice(0,last):cut)+'…';}
function symbolMini(p,type){const src=assetSrc(p,type),label=type==='flag'?'Bandera':'Escudo',status=p?.[type+'Status']||`No consta ${label.toLowerCase()} oficial verificado.`;return `<div class="symbol-mini">${src?`<img src="${esc(src)}" alt="${label} de ${esc(p.name)}" loading="lazy" decoding="async">`:`<div class="symbol-mini-placeholder">${type==='flag'?'⚑':'🛡️'}</div>`}<span>${label}</span><small>${src?'Oficial':'No consta'}</small><em class="sr-only">${esc(status)}</em></div>`;}
function place(id){ return {...municipalities.get(id),...content[id]}; }
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{if(!storageWarning){storageWarning=true;toast('El navegador no permite guardar. Esta partida durará mientras mantengas la página abierta.');}}}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4800);}
function tip(message){clearTimeout(tipTimer);$('#map-tip').textContent=message;$('#map-tip').classList.add('show');tipTimer=setTimeout(()=>$('#map-tip').classList.remove('show'),4200);}
function remaining(){return DAILY_LIMIT_ENABLED?Math.max(0,state.limit-dailyUsage(state)):Infinity;}
function owned(id){return !!(state.collection?.[id]||state.discovered?.[id]);}
function inExpedition(id){return !!state.discovered[id];}
function frontier(){return availableNeighbors(state,municipalities,eligible);}
function status(id){return owned(id)?'discovered':(!state.originId||frontier().includes(id))?'available':'locked';}

const CARD_EDITIONS={
  base:{id:'base',label:'Edición genérica',shortLabel:'Genérica',style:'generic',alwaysAvailable:true},
  templar:{id:'templar',label:'Edición Templaria',shortLabel:'Templaria',style:'templar',alwaysAvailable:false},
  tambor:{id:'tambor',label:'Ruta del Tambor y del Bombo',shortLabel:'Tambor y Bombo',style:'tambor',alwaysAvailable:false}
};
// Prepared for future events. Both events are intentionally inactive: every municipality starts with its generic card.
const SPECIAL_EVENTS={
  templar:{id:'templar',name:'Huellas del Temple',active:false,edition:'templar',eligibleIds:['44071'],note:'Castellote verificado. Otros municipios se incorporarán solo tras verificación histórica.'},
  tambor:{id:'tambor',name:'Ruta del Tambor y del Bombo',active:false,edition:'tambor',eligibleIds:['44013','44014','44051'],note:'Dentro del ámbito jugable actual: Alcañiz, Alcorisa y Calanda. La Ruta oficial reúne nueve municipios.'}
};
function editionOwned(id,edition=BASE_EDITION){return edition===BASE_EDITION?owned(id):!!state.unlockedEditions?.[editionKey(id,edition)];}
function editionFavorite(id,edition=BASE_EDITION){return !!state.favorites?.[editionKey(id,edition)];}
function availableEditions(id){
  const out=[CARD_EDITIONS.base];
  for(const event of Object.values(SPECIAL_EVENTS)){
    if(event.active&&event.eligibleIds.includes(id)&&editionOwned(id,event.edition))out.push(CARD_EDITIONS[event.edition]);
  }
  return out;
}
function specialEditionHints(id){
  return Object.values(SPECIAL_EVENTS).filter(event=>event.eligibleIds.includes(id)).map(event=>({...CARD_EDITIONS[event.edition],event}));
}

const FEATURED_COMARCAS=['Bajo Aragón','Matarraña / Matarranya','Maestrazgo'];
const COMARCA_CLASS={
  'Bajo Aragón':'bajo-aragon',
  'Matarraña / Matarranya':'matarrana',
  'Maestrazgo':'maestrazgo'
};
function comarcaIds(name){return [...eligible].filter(id=>place(id).comarca===name);}
function comarcaProgress(name){const ids=comarcaIds(name),done=ids.filter(owned).length;return {name,done,total:ids.length,percent:ids.length?Math.round(done*100/ids.length):0};}
function comarcaComplete(name){const p=comarcaProgress(name);return p.total>0&&p.done===p.total;}
function provinceComplete(name){const ids=geography.municipalities.filter(m=>m.province===name).map(m=>m.id);return ids.length>0&&ids.every(id=>eligible.has(id)&&owned(id));}
function completedComarcaFor(id){const name=place(id).comarca;return FEATURED_COMARCAS.includes(name)&&comarcaComplete(name)?name:null;}

const ACHIEVEMENTS=[
  {id:'first',icon:'🧭',title:'Primer paso',description:'Consigue tu primera carta.',test:()=>practicePool(state).length>=1},
  {id:'ten',icon:'🗺️',title:'Explorador',description:'Descubre 10 municipios.',test:()=>practicePool(state).length>=10},
  {id:'twentyfive',icon:'🥾',title:'Caminante de Aragón',description:'Descubre 25 municipios.',test:()=>practicePool(state).length>=25},
  {id:'fifty',icon:'🏔️',title:'Gran explorador',description:'Descubre 50 municipios.',test:()=>practicePool(state).length>=50},
  {id:'bajo',icon:'🏅',title:'Bajo Aragón completo',description:'Completa sus 20 municipios.',test:()=>comarcaComplete('Bajo Aragón')},
  {id:'matarrana',icon:'🏅',title:'Matarraña completo',description:'Completa sus 18 municipios.',test:()=>comarcaComplete('Matarraña / Matarranya')},
  {id:'maestrazgo',icon:'🏅',title:'Maestrazgo completo',description:'Completa sus 15 municipios.',test:()=>comarcaComplete('Maestrazgo')},
  {id:'three',icon:'👑',title:'Tres comarcas',description:'Completa Bajo Aragón, Matarraña y Maestrazgo.',test:()=>FEATURED_COMARCAS.every(comarcaComplete)}
];
function achievementStatus(){return ACHIEVEMENTS.map(a=>({...a,unlocked:!!a.test()}));}
function achievementHtml(){const list=achievementStatus(),unlocked=list.filter(a=>a.unlocked).length;return `<section class="achievements"><div class="achievements-head"><div><p class="eyebrow">Logros</p><h2>Tu camino por Aragón</h2></div><strong>${unlocked}/${list.length}</strong></div><div class="achievement-grid">${list.map(a=>`<article class="achievement ${a.unlocked?'unlocked':'locked'}"><span aria-hidden="true">${a.unlocked?a.icon:'◌'}</span><div><strong>${esc(a.title)}</strong><small>${esc(a.description)}</small></div></article>`).join('')}</div></section>`;}
function mapComarcaStatus(){return FEATURED_COMARCAS.map(name=>{const p=comarcaProgress(name),left=p.total-p.done;return `<span class="map-comarca-pill comarca-${COMARCA_CLASS[name]} ${p.percent===100?'complete':''}"><b>${esc(name)}</b><i>${p.done}/${p.total}</i><small>${left===0?'completa':`faltan ${left}`}</small></span>`;}).join('');}

function setView(box){viewport=[...box];map.setAttribute('viewBox',viewport.join(' '));renderPins();}
function fitIds(ids,padding=.28){
  const boxes=ids.map(id=>municipalities.get(id)?.bbox).filter(Boolean);
  if(!boxes.length)return geography.bounds;
  const x0=Math.min(...boxes.map(b=>b[0])),y0=Math.min(...boxes.map(b=>b[1])),x1=Math.max(...boxes.map(b=>b[2])),y1=Math.max(...boxes.map(b=>b[3]));
  let width=Math.max(24,x1-x0)*(1+padding*2),height=Math.max(24,y1-y0)*(1+padding*2);
  const ratio=(map.clientWidth||800)/(map.clientHeight||700);
  if(width/height<ratio)width=height*ratio;else height=width/ratio;
  return [(x0+x1-width)/2,(y0+y1-height)/2,width,height];
}
function showZone(){setView(fitIds(state.originId?[...expeditionPool(state),...frontier()]:[...eligible],.24));}
function zoom(factor){const [x,y,w,h]=viewport;const nw=Math.max(35,Math.min(1900,w*factor)),nh=h*(nw/w);setView([x+(w-nw)/2,y+(h-nh)/2,nw,nh]);}
function buildMap(){
  const defs=`<defs>
    <linearGradient id="gradient-bajo-aragon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e8f82"/><stop offset="1" stop-color="#e2b542"/></linearGradient>
    <linearGradient id="gradient-matarrana" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f3345"/><stop offset="1" stop-color="#d7a94a"/></linearGradient>
    <linearGradient id="gradient-maestrazgo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#477a4f"/><stop offset="1" stop-color="#b96f3e"/></linearGradient>
  </defs>`;
  $('#terrain').innerHTML=defs+geography.municipalities.map(m=>`<path class="municipality" data-id="${m.id}" data-comarca="${esc(m.comarca)}" d="${m.path}"><title>Municipio por descubrir</title></path>`).join('');
  $('#province-lines').innerHTML=geography.provinces.map(p=>`<path class="province-line" data-province="${esc(p.name)}" d="${p.path}"></path><text class="province-name" x="${p.point[0]}" y="${p.point[1]}">${esc(p.name)}</text>`).join('');
}
function renderMap(){
  const open=new Set(frontier());
  const terrain=$('#terrain'),paths=terrain.querySelectorAll?[...terrain.querySelectorAll('.municipality')]:[...terrain.children].filter(path=>path.dataset?.id);
  for(const path of paths){
    const id=path.dataset.id,known=inExpedition(id),ready=eligible.has(id)&&(!state.originId||open.has(id));
    const comarca=municipalities.get(id)?.comarca,completed=FEATURED_COMARCAS.includes(comarca)&&comarcaComplete(comarca);
    path.setAttribute('class',['municipality',eligible.has(id)?'pilot':'',FEATURED_COMARCAS.includes(comarca)?'comarca-hint':'',FEATURED_COMARCAS.includes(comarca)?'comarca-'+COMARCA_CLASS[comarca]:'',known?'discovered':ready?'available':'locked',selected===id?'selected':'',completed?'comarca-complete':''].filter(Boolean).join(' '));
    path.querySelector('title').textContent=known?place(id).name:ready?'Municipio disponible para descubrir':'Territorio todavía sin explorar';
  }
  document.querySelectorAll('.province-line').forEach(path=>path.classList.toggle('province-complete',provinceComplete(path.dataset.province)));
  renderPins();
  $('#daily-badge').textContent=`${practicePool(state).length} / ${eligible.size} descubiertos · Sin límite diario`;
  if($('#map-comarca-status'))$('#map-comarca-status').innerHTML=mapComarcaStatus();
  $('#collection-count').textContent=practicePool(state).length;
}
function destinationLabel(id){return `Destino ${String(frontier().indexOf(id)+1).padStart(2,'0')}`;}
function silhouette(id,cls='silhouette'){
 const p=place(id),b=p.bbox,pad=3;
 return `<svg class="${cls}" viewBox="${b[0]-pad} ${b[1]-pad} ${b[2]-b[0]+pad*2} ${b[3]-b[1]+pad*2}" aria-hidden="true"><path d="${p.path}"></path></svg>`;
}
function symbol(p,type,cls=''){
 const src=assetSrc(p,type),label=type==='flag'?'Bandera':'Escudo',status=p?.[type+'Status']||`No consta una imagen de ${label.toLowerCase()} suficientemente verificada para incorporarla al juego.`;
 return src?`<img class="${cls}" src="${esc(src)}" alt="${label} de ${esc(p.name)}" loading="eager" decoding="async">`:`<span class="symbol-pending ${esc(cls)}"><b>${label}</b><small>${esc(status)}</small></span>`;
}
function number(value,digits=0){return Number.isFinite(value)?new Intl.NumberFormat('es-ES',{maximumFractionDigits:digits}).format(value):'—';}
function factLink(url,label='Ver fuente'){return url?`<a class="fact-source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'';}

function renderPins(){
  if(!viewport||!municipalities)return;
  if(!state.originId){$('#pins').innerHTML='';return;}
  const unit=Math.max(viewport[2]/Math.max(map.clientWidth||850,350),viewport[3]/Math.max(map.clientHeight||700,330));
  const full=viewport[2]>650, labels=[];
  const ids=full?[state.originId]:[...expeditionPool(state),...frontier()].sort((a,b)=>(b===selected)-(a===selected)||(b===state.originId)-(a===state.originId));
  $('#pins').innerHTML=ids.map(id=>{
    const p=place(id),[x,y]=p.point,known=inExpedition(id),origin=state.originId===id;
    const size=unit*(full?14:15),labelSize=unit*12,labelY=y+size*2.1;
    const label=known?p.name:destinationLabel(id);
    const rect=[x-label.length*labelSize*.27,labelY-labelSize,x+label.length*labelSize*.27,labelY+labelSize*.3];
    const showLabel=(known||selected===id)&&!labels.some(r=>r[0]<rect[2]&&r[2]>rect[0]&&r[1]<rect[3]&&r[3]>rect[1]);
    if(showLabel)labels.push(rect);
    return `<g class="pin ${known?'':'mystery-pin'}" data-id="${id}" tabindex="0" role="button" aria-label="${esc(label)}${known?', descubierto':', disponible para explorar'}">${origin?`<circle class="origin-halo" cx="${x}" cy="${y}" r="${size*1.28}"></circle>`:''}<circle cx="${x}" cy="${y}" r="${size}"></circle>${known&&assetSrc(p,'shield')?`<image href="${esc(assetSrc(p,'shield'))}" x="${x-size*.58}" y="${y-size*.82}" width="${size*1.16}" height="${size*1.64}"></image>`:`<text x="${x}" y="${y+size*.32}" text-anchor="middle" style="font-size:${size}px;stroke:none">${known?'•':'?'}</text>`}${showLabel?`<text x="${x}" y="${labelY}" text-anchor="middle" style="font-size:${labelSize}px;stroke-width:${unit*3}px">${esc(label)}</text>`:''}</g>`;
  }).join('');
  document.querySelectorAll('.province-name').forEach(e=>e.style.display=full?'':'none');
}

function selectPlace(id){
  if(!state.originId)return;
  if(!eligible.has(id)){tip('Por ahora puedes explorar Bajo Aragón, Matarraña y Maestrazgo. Ampliaremos el resto de Aragón más adelante.');return;}
  if(!inExpedition(id)&&!frontier().includes(id)){tip('Este municipio está en tu colección, pero no forma parte de la expedición actual. Puedes abrir su carta desde Mis cartas.');return;}
  selected=id;showPage('map');renderMap();
  if(inExpedition(id)){
    openDialog(`<div class="dialog-inner card-dialog"><p class="eyebrow">Tu colección</p><h2 id="dialog-title">${esc(place(id).name)}</h2>${card(id)}<button class="primary" data-action="review" data-id="${id}">Repasar este municipio</button></div>`);
  }else{
    openDialog(`<div class="dialog-inner"><p class="eyebrow">${esc(destinationLabel(id))}</p><h2 id="dialog-title">Territorio por descubrir</h2><div class="mystery-outline">${silhouette(id)}</div><p>4 pantallas · 3 preguntas · 1 nueva carta</p><button class="primary" data-action="explore" data-id="${id}">Descubrir este municipio →</button></div>`);
  }
}

function card(id,origin=state.originId===id,edition=BASE_EDITION){
  const p=place(id),ed=CARD_EDITIONS[edition]||CARD_EDITIONS.base,fav=editionFavorite(id,edition);
  const special=edition!==BASE_EDITION;
  const photo=photoUrl(id),hasPhoto=!!photo,singularity=singularityText(p);
  const editionChip=special?`<span class="edition-chip special">${esc(ed.shortLabel)}</span>`:'';
  const hero = hasPhoto
    ? `<div class="card-hero"><img class="card-photo" src="${esc(photo)}" alt="Fotografía real de ${esc(p.name)}" loading="lazy" decoding="async"><div class="card-hero-overlay"></div>${editionChip}<button class="card-favorite ${fav?'active':''}" data-action="toggle-edition-favorite" data-id="${id}" data-edition="${esc(edition)}" aria-label="${fav?'Quitar':'Marcar'} ${esc(p.name)}${special?` · ${esc(ed.shortLabel)}`:''} como favorita" title="Favorita">${fav?'★':'☆'}</button><div class="card-top-meta"><span class="card-comarca-chip">${esc(p.comarca)}</span>${origin?'<span class="origin-tag hero-origin-tag">Aquí empezó tu aventura</span>':''}</div><div class="card-hero-text"><h3 class="card-name">${esc(p.name)}</h3><div class="card-place">${esc(p.province)}</div><div class="card-photo-credit">Foto real · ${esc(photoCredit(id))}</div></div></div>`
    : `<div class="card-face">${editionChip}<button class="card-favorite ${fav?'active':''}" data-action="toggle-edition-favorite" data-id="${id}" data-edition="${esc(edition)}" aria-label="${fav?'Quitar':'Marcar'} ${esc(p.name)}${special?` · ${esc(ed.shortLabel)}`:''} como favorita" title="Favorita">${fav?'★':'☆'}</button>${symbol(p,'flag','flag')}<div class="shield-stamp">${symbol(p,'shield')}</div></div>`;
  return `<article class="card card-modern card-edition-${esc(ed.style)}" data-edition="${esc(edition)}">${hero}<div class="card-body modern"><div class="card-stats"><div class="card-stat"><strong>${number(p.population)}</strong><small>habitantes · ${esc(p.populationYear||'')}</small></div><div class="card-stat"><strong>${number(p.areaKm2,2)} km²</strong><small>superficie municipal</small></div></div><div class="card-symbol-row">${symbolMini(p,'shield')}${symbolMini(p,'flag')}</div><div class="card-section modern-section"><span class="section-title">Fiestas y tradiciones</span><strong>${esc(p.patron||'Celebración local documentada')}</strong><p>${esc(p.festival||p.localHolidays||'Consulta la fuente local')}</p></div>${singularity?`<div class="card-section modern-section story"><span class="section-title">Un detalle para recordar</span><p>${esc(excerpt(singularity,150))}</p></div>`:''}</div></article>`;
}

function renderStart(){
  const start=$('#onboarding');
  start.hidden=!!state.originId;$('#map-panel').hidden=!state.originId;$('#new-expedition').hidden=!state.originId;
  if(state.originId)return;
  // Keep the search field and caret intact during background refreshes.
  if($('#municipality-search'))return;
  start.innerHTML=`<div class="start-card"><p class="eyebrow">Bajo Aragón · Matarraña · Maestrazgo</p><h1>¿Dónde empezamos?</h1><p>Busca tu municipio de origen y descubre los pueblos que lo rodean.</p><label for="municipality-search" class="search-label">Tu punto de partida</label><div class="search-wrap"><span aria-hidden="true">⌕</span><input id="municipality-search" type="search" placeholder="Escribe un municipio…" autocomplete="off" aria-controls="origin-list"></div><div id="origin-list" class="origin-results" aria-live="polite">${originList('')}</div><p class="start-note">${eligible.size} municipios · Cada descubrimiento abre nuevas rutas.</p></div>`;
}
function originList(query){
 const normalized=stripAccents(query.trim());
 if(!normalized)return '<p class="search-hint">Por ejemplo, La Ginebrosa, Alcorisa o Valderrobres.</p>';
 const ids=[...eligible].filter(id=>stripAccents(place(id).name).includes(normalized)).sort((a,b)=>place(a).name.localeCompare(place(b).name,'es'));
 return ids.length?ids.slice(0,8).map(id=>`<button class="origin-result" data-action="origin" data-id="${id}"><span><strong>${esc(place(id).name)}</strong><small>${esc(place(id).comarca)}</small></span><span aria-hidden="true">→</span></button>`).join('')+(ids.length>8?'<p class="search-hint">Escribe alguna letra más para afinar la búsqueda.</p>':''):'<p class="search-hint">No encontramos ese municipio en Bajo Aragón, Matarraña o Maestrazgo.</p>';
}
function renderCollection(){
  const all=practicePool(state).sort((a,b)=>place(a).name.localeCompare(place(b).name,'es'));
  const favoriteCards=[];
  for(const id of all)for(const ed of availableEditions(id))if(editionFavorite(id,ed.id))favoriteCards.push({id,edition:ed.id});
  const entries=collectionFilter==='favorites'?favoriteCards:all.map(id=>({id,edition:BASE_EDITION}));
  const progress=FEATURED_COMARCAS.map(comarcaProgress);
  const progressHtml=`<div class="comarca-progress-grid">${progress.map(p=>`<article class="comarca-progress-card ${p.percent===100?'complete':''}"><div><strong>${esc(p.name)}</strong><span>${p.done}/${p.total}</span></div><div class="progress-track"><i style="width:${p.percent}%"></i></div><small>${p.percent===100?'✓ Comarca completada':p.percent+'% descubierto'}</small></article>`).join('')}</div>`;
  const controls=all.length?`<div class="collection-tools"><div class="collection-filters"><button class="filter-button ${collectionFilter==='all'?'active':''}" data-action="filter-all">Cartas · ${all.length}</button><button class="filter-button ${collectionFilter==='favorites'?'active':''}" data-action="filter-favorites">★ Favoritas · ${favoriteCards.length}</button></div><button class="primary review-challenge-button" data-action="practice-challenge" ${all.length<2?'disabled':''}>🧠 Reto de repaso</button></div>`:'';
  const cards=entries.length?`<div class="collection-grid">${entries.map(({id,edition})=>`<article class="collection-item-wrap">${card(id,false,edition)}<button class="collection-open" data-action="view-card" data-id="${id}" data-edition="${edition}" aria-label="Abrir carta ${esc(CARD_EDITIONS[edition].shortLabel)} de ${esc(place(id).name)}">Abrir carta</button></article>`).join('')}</div>`:collectionFilter==='favorites'?'<div class="empty compact"><span aria-hidden="true">☆</span><p class="intro">Todavía no has marcado ninguna edición de carta como favorita.</p></div>':'';
  const dormant=Object.values(SPECIAL_EVENTS).map(e=>`<article class="event-preview locked"><span>🔒</span><div><strong>${esc(e.name)}</strong><small>Evento preparado · todavía no activo</small></div></article>`).join('');
  $('#collection').innerHTML=`<p class="eyebrow">Tu colección</p><h1>Tus municipios.</h1><p class="collection-progress">${all.length} de ${eligible.size} cartas · ${all.length} de 731 municipios de Aragón</p>${progressHtml}${achievementHtml()}${controls}${all.length?`${cards}<section class="future-editions"><p class="eyebrow">Ediciones especiales</p><h2>Eventos preparados</h2><p class="subtle">Las cartas especiales serán ediciones adicionales. No sustituyen a tu carta genérica y ahora mismo permanecen bloqueadas.</p><div class="event-preview-grid">${dormant}</div></section><p class="subtle" style="margin-top:25px">Cada edición tiene su propio ☆/★. Las cartas especiales aparecerán aquí cuando un evento las desbloquee.</p>`:'<div class="empty"><span aria-hidden="true">✧</span><p class="intro">Toda colección empieza con un lugar.<br>Elige tu municipio y consigue tu primera carta.</p><button class="primary" data-action="map">Elegir mi punto de partida</button></div>'}`;
}
function renderAll(){renderStart();renderMap();renderCollection();}
function showPage(page){$('#explorer').hidden=page!=='map';$('#collection').hidden=page!=='collection';$('#nav-map').classList.toggle('active',page==='map');$('#nav-cards').classList.toggle('active',page==='collection');if(page==='collection')renderCollection();else requestAnimationFrame(renderPins);}

function openDialog(html){
  $('#dialog-content').innerHTML=html;
  if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();}
  dialog.scrollTop=0;
  requestAnimationFrame(()=>{const el=$('#dialog-content .primary')||$('#dialog-content button')||$('#close-dialog');el?.focus({preventScroll:true});});
}
function closeDialog(){session=null;dialog.close();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});else $('#nav-map').focus({preventScroll:true});}
function miniMap(id){
  const p=place(id),box=fitMini(p),neighbors=new Set(p.neighbors);
  return `<svg class="location-mini" viewBox="${box.join(' ')}" role="img" aria-label="Ubicación de ${esc(p.name)} entre los municipios vecinos"><title>${esc(p.name)} y su entorno</title>${geography.municipalities.filter(m=>m.id===id||neighbors.has(m.id)).map(m=>`<path d="${m.path}" fill="${m.id===id?'#1ba68d':'#e8eff5'}" stroke="#8da9b8" stroke-width=".7" vector-effect="non-scaling-stroke"></path>`).join('')}<circle cx="${p.point[0]}" cy="${p.point[1]}" r="${box[2]*.018}" fill="#ffffff" stroke="#12695e" stroke-width="1" vector-effect="non-scaling-stroke"></circle></svg>`;
}
function fitMini(p){const [x0,y0,x1,y1]=p.bbox;let h=Math.max(15,y1-y0)*1.6,w=Math.max(15,x1-x0)*1.6;if(w/h<1.9)w=h*1.9;else h=w/1.9;return [(x0+x1-w)/2,(y0+y1-h)/2,w,h];}
function startLesson(id,review=false){
  if(review&&!owned(id)){toast('Primero tienes que descubrir este municipio.');return;}
  if(!review&&(!frontier().includes(id)||remaining()===0)){toast('Elige un municipio disponible en el mapa.');return;}
  session={id,review,stage:'lesson',slide:0,question:0,correct:0,answered:false,questions:[]};renderLesson();
}
function renderLesson(){
  const p=place(session.id),step=session.slide;
  const stats=`<div class="area-fact"><strong>${number(p.areaKm2,2)} <small>km²</small></strong><span>Superficie del término municipal</span></div>`;
  const visuals=[
    `${miniMap(session.id)}${stats}<div class="detail-pair"><span>${esc(p.comarca)}</span><span>${esc(p.province)}</span></div>${factLink(p.areaSource,'Cartografía y superficie · Gobierno de Aragón')}`,
    `<div class="lesson-visual">${symbol(p,'flag','lesson-flag')}${symbol(p,'shield','lesson-shield')}</div><div class="lesson-caption"><span>BANDERA</span><span>ESCUDO</span></div>`,
    `<div class="population-hero"><span>UN MUNICIPIO, MUCHAS HISTORIAS</span><strong>${number(p.population)}</strong><span>habitantes · ${esc(p.populationYear||'Año pendiente')}</span>${factLink(p.populationSource,p.populationSourceLabel||'Fuente de población')}</div>${p.singularity?`<div class="story-fact"><span>UN DETALLE PARA RECORDAR</span><p>${esc(typeof p.singularity==='string'?p.singularity:p.singularity.text)}</p>${factLink(p.singularitySource||p.singularity?.source)}</div>`:''}`,
    `<div class="patron-visual"><span class="festival-icon" aria-hidden="true">🎉</span><h3>${esc(p.patron||'Fiestas locales')}</h3><p>${esc(p.festivalLabel||'Celebración local')}<br><strong>${esc(p.festival||p.localHolidays||'Información festiva documentada')}</strong></p>${p.localHolidays&&p.festival!==p.localHolidays?`<div class="local-holidays"><span>Fiestas locales ${esc(p.localHolidaysYear||'')}</span><strong>${esc(p.localHolidays)}</strong></div>`:''}</div>${factLink(p.festivalSource||p.localHolidaysSource||p.sources?.[0],'Fuente de la celebración')}`
  ];
  const titles=['Aquí está '+p.name,'Sus símbolos','Conoce el pueblo','Su celebración'];
  const text=['Fíjate en su forma y en el lugar que ocupa dentro de Aragón.',assetSrc(p,'flag')||assetSrc(p,'shield')?'Observa los símbolos oficiales documentados para este municipio.':'Aquí verás el estado oficial de sus símbolos. Si no constan en el registro del Gobierno de Aragón, lo indicamos expresamente.','Una cifra para situarte y un detalle para llevarte contigo.','Conoce una celebración documentada y, cuando están disponibles, sus fiestas locales oficiales.'];
  openDialog(`<div class="dialog-inner"><p class="eyebrow">${session.review?'Volver a conocer':'Conoce'} · ${esc(p.name)}</p><div class="lesson-step" aria-label="Paso ${step+1} de 4">${[0,1,2,3].map(i=>`<i class="${i<=step?'active':''}"></i>`).join('')}</div><h2 id="dialog-title">${esc(titles[step])}</h2><p>${esc(text[step])}</p>${visuals[step]}<div class="button-row">${step>0?'<button class="secondary" data-action="lesson-back">Atrás</button>':''}<button class="primary" data-action="lesson-next">${step===3?'Estoy listo para el reto':'Siguiente'} <span aria-hidden="true">→</span></button></div><p class="subtle" style="text-align:center">${step+1} / 4</p></div>`);
}

function startQuiz(){
  if(session.review&&practicePool(state).length<2){
    openDialog(`<div class="dialog-inner success"><p class="eyebrow">Presentación repasada</p><h2 id="dialog-title">Tu aventura acaba de empezar.</h2><p>Ya has vuelto a mirar tu primera carta. Cuando descubras otro municipio, podrás comparar sus símbolos en los retos de repaso.</p><button class="primary" data-action="success-map">Volver al mapa →</button></div>`);session=null;return;
  }
  // The only new symbols shown in exploration belong to the chosen destination.
  const p=place(session.id),ids=[session.id,...shuffle(practicePool(state).filter(id=>id!==session.id)).slice(0,3)];
  // Only show a heraldic question when another discovered card offers a real comparison.
  // Otherwise use actual municipal silhouettes; do not fabricate symbols.
  const kind=(assetSrc(p,'flag')&&ids.filter(id=>assetSrc(place(id),'flag')).length>=2)?'flag':(assetSrc(p,'shield')&&ids.filter(id=>assetSrc(place(id),'shield')).length>=2)?'shield':'shape';
  const symbolIds=ids.filter(id=>kind==='shape'||assetSrc(place(id),kind));
  const symbolic=symbolIds.length>=2?{
    title:kind==='shape'?`¿Cuál es la silueta de ${p.name}?`:`¿Cuál es ${kind==='flag'?'la bandera':'el escudo'} de ${p.name}?`,type:kind==='shape'?'shape':'flag',
    options:shuffle(symbolIds.map(id=>({id,label:place(id).name,image:kind==='shape'?null:assetSrc(place(id),kind)}))),answer:session.id,
    explanation:`Esta es la ${kind==='flag'?'bandera':kind==='shape'?'silueta':'imagen del escudo'} de ${p.name}.`
  }:{title:`¿Dónde está ${p.name}?`,type:'text',options:shuffle(['Teruel','Zaragoza','Huesca']).map(label=>({id:label,label})),answer:p.province,explanation:`${p.name} está en la provincia de ${p.province}.`};
  const patronOptions=ids.filter((id,i)=>place(id).patron&&ids.findIndex(other=>place(other).patron===place(id).patron)===i).map(id=>({id,label:place(id).patron}));
  const areas=[...new Set(ids.map(id=>place(id).areaKm2))];
  const third=p.patron&&patronOptions.length>=2?{title:`¿Qué patronos acabas de conocer en ${p.name}?`,type:'text',options:shuffle(patronOptions),answer:session.id,explanation:`${p.patron}. Celebración local: ${p.festival}.`}:areas.length>=2?{title:`¿Qué superficie tiene ${p.name}?`,type:'text',options:shuffle(areas).map(value=>({id:String(value),label:number(value,2)+' km²'})),answer:String(p.areaKm2),explanation:`Su término municipal ocupa ${number(p.areaKm2,2)} km².`}:{title:`¿En qué provincia está ${p.name}?`,type:'text',options:shuffle(['Teruel','Zaragoza','Huesca']).map(label=>({id:label,label})),answer:p.province,explanation:`${p.name} está en ${p.province}.`};
  session.questions=[symbolic,
    {title:`¿A qué comarca pertenece ${p.name}?`,type:'text',options:shuffle([...new Set([p.comarca,'Bajo Aragón','Matarraña / Matarranya','Maestrazgo','Andorra-Sierra de Arcos'])].slice(0,4)).map(label=>({id:label,label})),answer:p.comarca,explanation:`${p.name} pertenece a ${p.comarca}.`},
    third
  ];session.stage='quiz';session.question=0;session.correct=0;session.answered=false;renderQuiz();
}
function renderQuiz(){
  const q=session.questions[session.question],p=place(session.id);
  openDialog(`<div class="dialog-inner"><p class="eyebrow">${esc(p.name)} · Pregunta ${session.question+1} de 3</p><div class="lesson-step" aria-label="Pregunta ${session.question+1} de 3">${[0,1,2].map(i=>`<i class="${i<=session.question?'active':''}"></i>`).join('')}</div><h2 id="dialog-title">${esc(q.title)}</h2><p>Elige una respuesta. Cada acierto te acerca a tu carta.</p><div class="options">${q.options.map((o,i)=>`<button class="option" data-action="answer" data-option="${i}" aria-label="${q.type!=='text'?'Imagen, opción '+String.fromCharCode(65+i):esc(o.label)}"><span class="option-letter" aria-hidden="true">${String.fromCharCode(65+i)}</span>${q.type==='shape'?silhouette(o.id,'option-silhouette'):q.type==='flag'?`<img src="${esc(o.image)}" alt="Opción ${String.fromCharCode(65+i)}">`:esc(o.label)}</button>`).join('')}</div><div id="answer-feedback" aria-live="polite"></div></div>`);
}
function answer(index){
  if(!session||session.stage!=='quiz'||session.answered)return;
  const q=session.questions[session.question],option=q.options[index];if(!option)return;
  session.answered=true;const correct=option.id===q.answer;if(correct)session.correct++;
  document.querySelectorAll('.option').forEach((el,i)=>{el.disabled=true;if(q.options[i].id===q.answer)el.classList.add('correct');else if(i===index)el.classList.add('wrong');});
  $('#answer-feedback').innerHTML=`<div class="feedback ${correct?'':'wrong'}"><strong>${correct?'¡Bien recordado!':'Una pista para la próxima.'}</strong><br>${esc(q.explanation)}</div><button class="primary" style="margin-top:16px" data-action="${correct?'quiz-next':'quiz-retry'}">${correct?(session.question===2?'Terminar el reto':'Siguiente pregunta'):'Volver a mirar y reintentar'} →</button>${correct?'':'<p class="subtle" style="text-align:center">El intento no consume ningún descubrimiento.</p>'}`;
  $('#answer-feedback button').focus({preventScroll:true});
}
function startPracticeChallenge(){
  const pool=shuffle(practicePool(state));
  if(pool.length<2){toast('Descubre al menos dos municipios para empezar el reto de repaso.');return;}
  const count=Math.min(5,pool.length),targets=pool.slice(0,count);
  session={stage:'practice',question:0,correct:0,answered:false,questions:targets.map(id=>{const p=place(id);const options=shuffle(FEATURED_COMARCAS.map(label=>({id:label,label})));return {id,title:`¿A qué comarca pertenece ${p.name}?`,options,answer:p.comarca,explanation:`${p.name} pertenece a ${p.comarca}.`};})};
  renderPracticeQuiz();
}
function renderPracticeQuiz(){
  const q=session?.questions?.[session.question];if(!q)return;
  openDialog(`<div class="dialog-inner practice-dialog"><p class="eyebrow">Reto de repaso · ${session.question+1} de ${session.questions.length}</p><div class="lesson-step">${session.questions.map((_,i)=>`<i class="${i<=session.question?'active':''}"></i>`).join('')}</div><h2 id="dialog-title">${esc(q.title)}</h2><p>Sin consumir descubrimientos. Solo para poner a prueba tu memoria.</p><div class="options">${q.options.map((o,i)=>`<button class="option" data-action="practice-answer" data-option="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span>${esc(o.label)}</button>`).join('')}</div><div id="answer-feedback" aria-live="polite"></div></div>`);
}
function practiceAnswer(index){
  if(!session||session.stage!=='practice'||session.answered)return;const q=session.questions[session.question],option=q.options[index];if(!option)return;
  session.answered=true;const correct=option.id===q.answer;if(correct)session.correct++;
  document.querySelectorAll('.option').forEach((el,i)=>{el.disabled=true;if(q.options[i].id===q.answer)el.classList.add('correct');else if(i===index)el.classList.add('wrong');});
  const last=session.question===session.questions.length-1;
  $('#answer-feedback').innerHTML=`<div class="feedback ${correct?'':'wrong'}"><strong>${correct?'¡Correcto!':'Esta se nos ha escapado.'}</strong><br>${esc(q.explanation)}</div><button class="primary" style="margin-top:16px" data-action="practice-next">${last?'Ver resultado':'Siguiente'} →</button>`;
}
function practiceNext(){
  if(!session||session.stage!=='practice')return;
  if(session.question<session.questions.length-1){session.question++;session.answered=false;renderPracticeQuiz();return;}
  const score=session.correct,total=session.questions.length;session=null;
  openDialog(`<div class="dialog-inner success practice-result"><div class="practice-medal">${score===total?'🏆':score>=Math.ceil(total*.6)?'🥇':'🧭'}</div><p class="eyebrow">Reto completado</p><h2 id="dialog-title">${score} de ${total} correctas</h2><p>${score===total?'Perfecto. Te conoces ya muy bien estas comarcas.':score>=Math.ceil(total*.6)?'Muy bien. Un repaso más y lo clavas.':'Aquí hay territorio para volver a explorar.'}</p><div class="button-row"><button class="secondary" data-action="practice-challenge">Repetir reto</button><button class="primary" data-action="collection">Volver a mis cartas</button></div></div>`);
}

function finishQuiz(){
  const s=session;if(!s||s.correct!==3)return;
  if(s.review){session=null;showSuccess(s.id,true,false);return;}
  const result=discover(state,s.id,municipalities,eligible,true);
  if(!result.ok){session=null;openDialog(`<div class="dialog-inner"><h2 id="dialog-title">Vuelve al mapa para continuar.</h2><p>${result.reason==='daily-limit'?'Has alcanzado el cupo de hoy. Puedes repasar tus cartas y volver a descubrir mañana.':'Este municipio ya no está disponible para este descubrimiento. Vuelve al mapa para continuar.'}</p><button class="primary" data-action="close">Volver al mapa</button></div>`);renderAll();return;}
  state=result.state;persist();selected=s.id;session=null;renderAll();const completed=completedComarcaFor(s.id);showSuccess(s.id,false,false,completed);
}
function showSuccess(id,review,origin,completedComarca=null){
  const p=place(id);
  openDialog(`<div class="dialog-inner success"><p class="success-tag">${origin?'AQUÍ EMPIEZA TU AVENTURA':review?'UN PUEBLO BIEN RECORDADO':'UN NUEVO LUGAR EN TU MAPA'}</p><div class="success-seal">${assetSrc(p,'shield')?symbol(p,'shield'):silhouette(id)}</div><h2 id="dialog-title">${esc(p.name)}</h2><p>${origin?'Tu primera carta ya es tuya. Desde aquí podrás explorar los municipios que comparten frontera con tu pueblo.':review?'Has repasado su identidad, su comarca y sus patronos. El repaso no consume descubrimientos.':'Has conseguido su carta y su territorio se ha iluminado. Tu recorrido por Aragón acaba de crecer.'}</p>${completedComarca?`<div class="confetti-field" aria-hidden="true"><i>●</i><i>▲</i><i>◆</i><i>●</i><i>■</i><i>▲</i><i>◆</i><i>●</i></div><div class="comarca-celebration comarca-${COMARCA_CLASS[completedComarca]}"><span class="comarca-badge" aria-hidden="true">🏅</span><strong>¡${esc(completedComarca)} al 100%!</strong><small>${comarcaIds(completedComarca).length}/${comarcaIds(completedComarca).length} municipios · Insignia de comarca conseguida</small></div>`:''}<p><strong>${origin?'Carta de origen · gratuita':review?'3 de 3 respuestas correctas':'Nuevas fronteras desbloqueadas'}</strong></p>${origin?`<button class="secondary" data-action="review" data-id="${id}">Conocer mi municipio</button>`:''}<button class="primary" data-action="success-map">${origin?'Explorar mis alrededores':'Volver a mi mapa'} <span aria-hidden="true">→</span></button></div>`);
}
function settings(){
  openDialog(`<div class="dialog-inner"><p class="eyebrow">Tu aventura</p><h2 id="dialog-title">Explora a tu ritmo.</h2><p>Ahora puedes recorrer los ${eligible.size} municipios sin límite diario.</p><div class="separator"></div><p><strong>${practicePool(state).length} cartas guardadas en este navegador.</strong></p><button class="secondary" data-action="ask-new-expedition">↻ Nueva expedición</button><p class="subtle" style="margin-top:10px">Cambiarás de punto de partida y se reiniciará solo la ruta del mapa. Tu colección, comarcas completadas y cartas se conservarán.</p><button class="text-button danger-text" data-action="ask-reset-all">Borrar todo mi progreso</button></div>`);
}
async function sources(){
  openDialog(`<div class="dialog-inner"><p class="eyebrow">Datos y símbolos reales</p><h2 id="dialog-title">Fuentes y créditos.</h2><div class="source-list"><p>Mapa municipal: <a href="https://icearagon.aragon.es/portal/wfs.jsp" target="_blank" rel="noopener noreferrer">IGEAR · Gobierno de Aragón</a>. Consulta del 15 de octubre de 2026. Geometrías simplificadas para el juego; las vecindades se calculan con los límites originales.</p><h3>Datos de tus municipios</h3><p>Las fuentes de cada nuevo destino aparecen al descubrirlo.</p><ul>${Object.entries(content).filter(([id])=>owned(id)||session?.id===id).map(([id,p])=>`<li><strong>${esc(p.name)}</strong><br>${[...new Set([...(p.sources||[]),p.areaSource,p.populationSource,p.singularitySource,p.festivalSource,p.localHolidaysSource,p.symbolStatusSource].filter(Boolean))].map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(url).hostname.replace('www.',''))}</a>`).join(' · ')}</li>`).join('')}</ul><h3>Banderas y escudos</h3><div id="asset-credits">Cargando atribuciones…</div></div></div>`);
  try{const credits=await loadJson('credits.json');if($('#asset-credits'))$('#asset-credits').innerHTML=credits.filter(c=>c.localFile==='assets/aragon-shield.png'||Object.keys(content).some(id=>(owned(id)||session?.id===id)&&[content[id].flag,content[id].shield].includes(c.localFile))).map(c=>`<p><a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer"><strong>${esc(c.name)}</strong></a><br>${esc(c.author||'Autoría indicada en la fuente')} · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.license)}</a><br>${esc(c.changes)}</p>`).join('');}catch{if($('#asset-credits'))$('#asset-credits').textContent='No se pudieron cargar las atribuciones. Vuelve a intentarlo.';}
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='select')selectPlace(id);
  else if(action==='back'){selected=null;renderStart();renderMap();}
  else if(action==='origin'){
    const result=chooseOrigin(state,id,eligible);if(!result.ok)return;
    state=result.state;persist();selected=id;renderAll();showZone();showSuccess(id,false,true);
  }
  else if(action==='explore')startLesson(id);
  else if(action==='review')startLesson(id,true);
  else if(action==='lesson-back'&&session){session.slide=Math.max(0,session.slide-1);renderLesson();}
  else if(action==='lesson-next'&&session){if(session.slide<3){session.slide++;renderLesson();}else startQuiz();}
  else if(action==='answer')answer(Number(button.dataset.option));
  else if(action==='quiz-next'&&session){if(session.question===2)finishQuiz();else{session.question++;session.answered=false;renderQuiz();}}
  else if(action==='quiz-retry'&&session){session.stage='lesson';session.slide=0;session.correct=0;session.question=0;session.answered=false;renderLesson();}
  else if(action==='success-map'){closeDialog();selected=null;showPage('map');showZone();renderAll();}
  else if(action==='close')closeDialog();
  else if(action==='collection')showPage('collection');
  else if(action==='filter-all'){collectionFilter='all';renderCollection();}
  else if(action==='filter-favorites'){collectionFilter='favorites';renderCollection();}
  else if(action==='toggle-favorite'||action==='toggle-edition-favorite'){const edition=button.dataset.edition||BASE_EDITION,key=editionKey(id,edition);state.favorites=state.favorites||{};if(state.favorites[key])delete state.favorites[key];else state.favorites[key]=true;persist();if(dialog.open&&action==='toggle-edition-favorite'){button.classList.toggle('active',!!state.favorites[key]);button.textContent=state.favorites[key]?'★':'☆';button.setAttribute('aria-label',`${state.favorites[key]?'Quitar':'Marcar'} ${place(id).name} · ${CARD_EDITIONS[edition]?.shortLabel||'Genérica'} como favorita`);}renderCollection();}
  else if(action==='practice-challenge')startPracticeChallenge();
  else if(action==='practice-answer')practiceAnswer(Number(button.dataset.option));
  else if(action==='practice-next')practiceNext();
  else if(action==='map'){showPage('map');selected=null;renderStart();renderMap();}
  else if(action==='locate'){if(dialog.open)closeDialog();selected=id;showPage('map');renderMap();setView(fitIds([id,...municipalities.get(id).neighbors],.1));if(window.innerWidth<700)map.scrollIntoView({behavior:'smooth',block:'center'});}
  else if(action==='view-card'){const edition=button.dataset.edition||BASE_EDITION;openDialog(`<div class="dialog-inner card-dialog"><p class="eyebrow">Tu colección · ${esc(CARD_EDITIONS[edition]?.label||'Edición genérica')}</p><h2 id="dialog-title">${esc(place(id).name)}</h2>${card(id,false,edition)}${specialEditionHints(id).length?`<div class="locked-editions"><strong>Ediciones especiales vinculadas</strong>${specialEditionHints(id).map(x=>`<span>🔒 ${esc(x.label)} · evento no activo</span>`).join('')}</div>`:''}${miniMap(id)}<div class="button-row"><button class="secondary" data-action="locate" data-id="${id}">Ver en el mapa</button><button class="primary" data-action="review" data-id="${id}">Repasar</button></div></div>`);}
  else if(action==='sources')sources();
  else if(action==='ask-new-expedition')openDialog(`<div class="dialog-inner"><p class="eyebrow">Nueva expedición</p><h2 id="dialog-title">¿Quieres cambiar de punto de partida?</h2><p>Se cerrará la ruta actual y volverás al buscador. <strong>Tus ${practicePool(state).length} cartas y todos tus logros se conservarán.</strong></p><div class="button-row"><button class="secondary" data-action="settings">Seguir aquí</button><button class="primary" data-action="new-expedition">Elegir otro territorio</button></div></div>`);
  else if(action==='new-expedition'){state=startNewExpedition(state);selected=null;session=null;$('#onboarding').innerHTML='';persist();closeDialog();showPage('map');setView(geography.bounds);renderAll();toast('Tu colección sigue guardada. Elige el origen de tu nueva expedición.');}
  else if(action==='ask-reset-all')openDialog(`<div class="dialog-inner"><p class="eyebrow">Borrar progreso</p><h2 id="dialog-title">¿Borrar toda tu colección?</h2><p>Esto sí eliminará tus cartas, comarcas completadas y la expedición actual de este navegador. No se puede deshacer.</p><div class="button-row"><button class="secondary" data-action="settings">Cancelar</button><button class="primary danger-button" data-action="reset-all">Borrar todo</button></div></div>`);
  else if(action==='settings')settings();
  else if(action==='reset-all'){state=clearAllProgress();selected=null;session=null;$('#onboarding').innerHTML='';persist();closeDialog();showPage('map');setView(geography.bounds);renderAll();toast('Progreso borrado. Puedes empezar una aventura nueva.');}
});
document.addEventListener('input',event=>{if(event.target.id==='municipality-search')$('#origin-list').innerHTML=originList(event.target.value);});
$('#nav-map').addEventListener('click',()=>state&&showPage('map'));
$('#nav-cards').addEventListener('click',()=>state&&showPage('collection'));
$('#settings').addEventListener('click',()=>state&&settings());
$('#new-expedition').addEventListener('click',()=>state&&state.originId&&openDialog(`<div class="dialog-inner"><p class="eyebrow">Nueva expedición</p><h2 id="dialog-title">¿Quieres cambiar de punto de partida?</h2><p>Se cerrará la ruta actual y volverás al buscador. <strong>Tus ${practicePool(state).length} cartas y todos tus logros se conservarán.</strong></p><div class="button-row"><button class="secondary" data-action="close">Seguir aquí</button><button class="primary" data-action="new-expedition">Elegir otro territorio</button></div></div>`));
$('#sources').addEventListener('click',()=>content&&sources());
$('#close-dialog').addEventListener('click',closeDialog);
dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closeDialog();}});
$('#zoom-in').addEventListener('click',()=>viewport&&zoom(.72));
$('#zoom-out').addEventListener('click',()=>viewport&&zoom(1/.72));
$('#zoom-region').addEventListener('click',()=>geography&&showZone());
$('#zoom-all').addEventListener('click',()=>geography&&setView(geography.bounds));
map.addEventListener('keydown',event=>{const target=event.target.closest('[data-id]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();selectPlace(target.dataset.id);}});
map.addEventListener('pointerdown',event=>{
  if(event.button!==0||!viewport||pointer||event.isPrimary===false)return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,box:[...viewport],target:event.target.closest('[data-id]')?.dataset.id};dragging=false;
  map.setPointerCapture(event.pointerId);
});
map.addEventListener('pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(Math.hypot(dx,dy)>5)dragging=true;
  if(dragging){map.classList.add('dragging');const scale=Math.max(pointer.box[2]/map.clientWidth,pointer.box[3]/map.clientHeight);setView([pointer.box[0]-dx*scale,pointer.box[1]-dy*scale,pointer.box[2],pointer.box[3]]);}
});
map.addEventListener('pointerup',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;const id=pointer.target;const wasDragging=dragging;pointer=null;dragging=false;map.classList.remove('dragging');map.releasePointerCapture(event.pointerId);if(!wasDragging&&id)selectPlace(id);
});
map.addEventListener('pointercancel',()=>{pointer=null;dragging=false;map.classList.remove('dragging');});
map.addEventListener('wheel',event=>{if(!viewport)return;event.preventDefault();zoom(event.deltaY>0?1.12:.89);},{passive:false});
window.addEventListener('resize',()=>viewport&&renderPins());
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state)renderAll();});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY||!municipalities)return;
  try{state=normalizeState(JSON.parse(event.newValue),municipalities,eligible);selected=null;session=null;if(dialog.open)closeDialog();renderAll();toast('Tu recorrido se ha actualizado desde otra pestaña.');}catch{}
});

try{
  [geography,content,photoCatalog]=await Promise.all([loadJson('map-data.json'),loadJson('pilot-content.json'),loadJson('photo-catalog.json').catch(()=>({}))]);
  const invalid=Object.entries(content).filter(([id,p])=>!p||!p.name||!Number.isFinite(p.areaKm2)||!Number.isFinite(p.population)||!p.populationYear||!p.singularity);
  if(invalid.length)throw new Error(`Datos incompletos en ${invalid.map(([id])=>id).join(', ')}`);
  municipalities=new Map(geography.municipalities.map(m=>[m.id,m]));eligible=new Set(Object.keys(content));
  state=freshState();try{state=normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)),municipalities,eligible);}catch{}
  $('#pilot-count').textContent=`Bajo Aragón · Matarraña · Maestrazgo · ${eligible.size} municipios`;
  buildMap();setView(state.originId?fitIds([...practicePool(state),...frontier()],.24):geography.bounds);renderAll();
  // Refresh the visible cup when the Madrid calendar day changes, including idle tabs.
  let observedDay=dayKey();setInterval(()=>{const today=dayKey();if(today!==observedDay){observedDay=today;renderAll();}},30000);
}catch(error){
  console.error(error);$('#main').innerHTML='<div class="error-box"><h1>El mapa aún no ha llegado.</h1><p>No se han podido cargar los datos. Comprueba la conexión y vuelve a abrir la página.</p><button class="primary" onclick="location.reload()">Volver a intentarlo</button></div>';
}
