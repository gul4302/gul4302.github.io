(function () {
  'use strict';
  const LOCAL_DATA_URL = 'public/arf.json';
  // Full upstream OSINT Framework database (23k+ lines). Used when internet is available.
  const REMOTE_DATA_URL = 'https://raw.githubusercontent.com/lockfale/OSINT-Framework/master/public/arf.json';
  let data = null;
  let allTools = [];
  let selected = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function flatten(node, path = []) {
    if (!node) return;
    const next = node.type === 'folder' ? path.concat(node.name) : path;
    if (node.type === 'url') allTools.push({...node, path: path.slice()});
    (node.children || []).forEach(child => flatten(child, next));
  }

  function renderTree() {
    const host = $('body');
    if (!host) return;
    let old = $('osint-tree');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'osint-tree';
    wrap.style.cssText = 'max-width:1100px;margin:28px auto;padding:0 18px 50px;';
    const root = document.createElement('div');
    root.innerHTML = '<h2 style="margin:0 0 16px">OSINT Tools</h2><p style="opacity:.75">Select a category or search for a tool above.</p>';
    const list = document.createElement('div');
    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;';
    (data.children || []).forEach(folder => {
      const b = document.createElement('button');
      b.type='button'; b.textContent=folder.name;
      b.style.cssText='padding:14px;text-align:left;border:1px solid #8885;border-radius:10px;background:transparent;color:inherit;cursor:pointer;font-size:15px;';
      b.onclick=()=>showCategory(folder);
      list.appendChild(b);
    });
    root.appendChild(list); wrap.appendChild(root); host.appendChild(wrap);
  }

  function showCategory(folder) {
    const tools=[];
    (function walk(n,path){ if(n.type==='url') tools.push({...n,path}); (n.children||[]).forEach(c=>walk(c,n.type==='folder'?path.concat(n.name):path)); })(folder,[]);
    const results=$('search-results');
    results.innerHTML=tools.map((t,i)=>`<div class="search-result" data-i="${i}" style="padding:10px;cursor:pointer"><b>${esc(t.name)}</b><br><small>${esc(t.bestFor||t.description||'')}</small></div>`).join('');
    results.style.display='block';
    [...results.children].forEach((el,i)=>el.onclick=()=>openTool(tools[i]));
  }

  function openTool(tool) {
    selected=tool;
    $('panel-title').textContent=tool.name||'';
    $('panel-breadcrumb').textContent=(tool.path||[]).join(' / ');
    const open=$('panel-open-tool'); open.href=tool.url||'#';
    setSection('panel-description-section','panel-description',tool.description);
    setSection('panel-usage-section','panel-usage',tool.bestFor);
    setSection('panel-io-section','panel-io',tool.input || tool.output ? `${tool.input||'—'} → ${tool.output||'—'}` : '');
    setSection('panel-opsec-section','panel-opsec',tool.opsecNote ? `${tool.opsec||''}: ${tool.opsecNote}` : tool.opsec);
    const badges=[];
    if(tool.pricing) badges.push(tool.pricing);
    if(tool.status) badges.push(tool.status);
    if(tool.registration) badges.push('registration');
    if(tool.localInstall) badges.push('local');
    if(tool.api) badges.push('API');
    $('panel-badges').innerHTML=badges.map(x=>`<span class="badge">${esc(x)}</span>`).join(' ');
    $('panel-badges').classList.toggle('empty',!badges.length);
    const rating=Number(localStorage.getItem('rating:'+tool.url)||0);
    $('rating-avg').textContent=rating?`${rating}/5`:'No rating';
    $('tool-panel').classList.add('open'); $('panel-overlay').classList.add('open');
  }
  function setSection(sectionId, textId, text) {
    const sec=$(sectionId); $(textId).textContent=text||''; sec.classList.toggle('empty',!text);
  }
  function closePanel(){ $('tool-panel').classList.remove('open'); $('panel-overlay').classList.remove('open'); }
  function search(q){
    const box=$('search-results'); q=q.trim().toLowerCase();
    if(!q){box.innerHTML='';box.style.display='none';return;}
    const hits=allTools.filter(t=>(t.name+' '+(t.description||'')+' '+(t.bestFor||'')).toLowerCase().includes(q)).slice(0,25);
    box.innerHTML=hits.length?hits.map((t,i)=>`<div class="search-result" data-i="${i}" style="padding:10px;cursor:pointer"><b>${esc(t.name)}</b><br><small>${esc((t.path||[]).join(' / '))}</small></div>`).join(''):'<div style="padding:10px">No tools found.</div>';
    box.style.display='block'; [...box.querySelectorAll('.search-result')].forEach((el,i)=>el.onclick=()=>openTool(hits[i]));
  }

  window.goDark=function(){
    const light=document.body.classList.toggle('light-mode'); localStorage.setItem('theme',light?'light':'dark');
    const b=$('header-theme-toggle'); if(b)b.textContent=light?'Dark Mode':'Light Mode';
  };
  window.toggleNotesPanel=function(){ const n=$('notes-panel'); if(n)n.classList.toggle('open'); const o=$('notes-overlay'); if(o)o.classList.toggle('open'); };

  document.addEventListener('DOMContentLoaded', async () => {
    $('panel-close')?.addEventListener('click',closePanel); $('panel-overlay')?.addEventListener('click',closePanel);
    $('search-input')?.addEventListener('input',e=>search(e.target.value));
    document.querySelectorAll('.report-btn').forEach(btn=>btn.addEventListener('click',()=>{ if(selected){$('panel-report-feedback').textContent='Thanks — this report was recorded locally.'; $('panel-report-feedback').classList.remove('hidden'); localStorage.setItem('report:'+selected.url,btn.dataset.type); }}));
    document.querySelectorAll('.star-click,.star-zero-btn').forEach(btn=>btn.addEventListener('click',()=>{ if(selected){localStorage.setItem('rating:'+selected.url,btn.dataset.value); $('rating-avg').textContent=btn.dataset.value+'/5'; }}));
    try {
      // Prefer the complete upstream database; fall back to the bundled local copy.
      let r = await fetch(REMOTE_DATA_URL, {cache:'no-store'});
      if (!r.ok) throw new Error('remote HTTP '+r.status);
      data = await r.json();
    } catch (remoteError) {
      console.warn('Upstream database unavailable; using local database.', remoteError);
      const r = await fetch(LOCAL_DATA_URL);
      if (!r.ok) throw new Error('local HTTP '+r.status);
      data = await r.json();
    }
    flatten(data);
    renderTree();
    } catch(e){ console.error(e); const host=$('body'); const msg=document.createElement('div'); msg.style.cssText='margin:30px auto;max-width:900px;padding:20px;color:#b00020;'; msg.innerHTML='<b>Could not load OSINT data.</b><br>Check your internet connection or make sure <code>public/arf.json</code> is beside this index.html.'; host.appendChild(msg); }
  });
})();
