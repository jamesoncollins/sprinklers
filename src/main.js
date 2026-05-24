const emptyProject = { version: 1, site: { name: 'New Site', address: '', imageSource: 'satellite' }, zones: [], sprinklers: [] };
let project = structuredClone(emptyProject);
let catalogRows = [];

const byId = (id) => document.getElementById(id);
const newBtn = byId('new-project');
const saveBtn = byId('save-project');
const loadInput = byId('load-project');
const catalogInput = byId('load-catalog');
const catalogStatus = byId('catalog-status');
const catalogList = byId('catalog-list');
const filterText = byId('filter-text');
const pressurePsi = byId('pressure-psi');
const lookupResult = byId('lookup-result');

const requiredCols = ['manufacturer','head_model','nozzle_model','pressure_psi','flow_gpm','radius_ft'];

function parseCsv(text){
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h)=>h.trim());
  const missing = requiredCols.filter((c)=>!headers.includes(c));
  if(missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
  return lines.slice(1).map((line)=>{
    const v=line.split(','); const o={}; headers.forEach((h,i)=>o[h]= (v[i]||'').trim()); return o;
  });
}

function groupKey(r){ return `${r.manufacturer} | ${r.head_model} | ${r.nozzle_model}`; }
function num(v){ return Number(v); }

function interpolate(rows, psi){
  const points = rows.map(r=>({pressurePsi:num(r.pressure_psi), flowGpm:num(r.flow_gpm), radiusFt:num(r.radius_ft)})).sort((a,b)=>a.pressurePsi-b.pressurePsi);
  const exact = points.find((p)=>p.pressurePsi===psi);
  if(exact) return { mode:'exact', ...exact };
  const lower = [...points].reverse().find((p)=>p.pressurePsi<psi);
  const upper = points.find((p)=>p.pressurePsi>psi);
  if(!lower) return { mode:'clamped-low', ...points[0] };
  if(!upper) return { mode:'clamped-high', ...points[points.length-1] };
  const t=(psi-lower.pressurePsi)/(upper.pressurePsi-lower.pressurePsi);
  return { mode:'interpolated', pressurePsi:psi, flowGpm: +(lower.flowGpm+t*(upper.flowGpm-lower.flowGpm)).toFixed(3), radiusFt:+(lower.radiusFt+t*(upper.radiusFt-lower.radiusFt)).toFixed(3) };
}

function renderCatalog(){
  const q = filterText.value.toLowerCase();
  const groups = new Map();
  for(const r of catalogRows){ const k=groupKey(r); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); }
  const keys=[...groups.keys()].filter((k)=>k.toLowerCase().includes(q));
  catalogList.innerHTML = keys.map((k)=>`<div class="row" data-key="${k}">${k}</div>`).join('') || '<div class="row">No matching models</div>';
  catalogList.querySelectorAll('.row[data-key]').forEach((el)=>el.addEventListener('click', ()=>{
    const key=el.dataset.key; const rows=groups.get(key); const psi=num(pressurePsi.value||0); const result=interpolate(rows,psi);
    lookupResult.textContent = JSON.stringify({ selected:key, inputPressurePsi:psi, result }, null, 2);
  }));
}

newBtn.addEventListener('click', () => { project = structuredClone(emptyProject); alert('New project created.'); });
saveBtn.addEventListener('click', () => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sprinklers-project.json'; a.click(); URL.revokeObjectURL(url); });
loadInput.addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const loaded = JSON.parse(await file.text()); if (typeof loaded !== 'object' || loaded === null || !('version' in loaded)) throw new Error('Invalid project JSON'); project = loaded; alert('Project loaded successfully.'); } catch (error) { alert(`Failed to load project: ${error.message}`); } finally { loadInput.value = ''; } });

catalogInput.addEventListener('change', async (event)=>{
  const file = event.target.files?.[0];
  if(!file) return;
  try {
    catalogRows = parseCsv(await file.text());
    catalogStatus.textContent = `Loaded ${catalogRows.length} catalog rows from ${file.name}`;
    renderCatalog();
  } catch (e) {
    catalogStatus.textContent = `Catalog error: ${e.message}`;
  } finally { catalogInput.value=''; }
});
filterText.addEventListener('input', renderCatalog);
pressurePsi.addEventListener('input', renderCatalog);
