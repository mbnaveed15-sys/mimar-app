
import React, { useState, useRef, useEffect } from "react";

/*
Mimar 1.1 PlannerApp
- Adds: Material painting tool, material brush, masking polygons, texture assets support
- Masking allows splitting an element's fill into regions with separate materials
- Painting brush applies material/texture to topology (walls, floors, furniture)
Note: This is a demo-level implementation suitable for sandbox use; production should use a geometry lib.
*/

export default function PlannerApp(){
  const [tool, setTool] = useState('select'); // select, wall, door, window, furniture, paint, brush, mask, erase
  const [gridPx, setGridPx] = useState(25);
  const [scaleMMperPx, setScaleMMperPx] = useState(10);
  const [elements, setElements] = useState(()=> JSON.parse(localStorage.getItem('planner.elements')||'[]'));
  const [materials, setMaterials] = useState(()=> JSON.parse(localStorage.getItem('planner.materials')||'null') || defaultMaterials());
  const [masks, setMasks] = useState(()=> JSON.parse(localStorage.getItem('planner.masks')||'[]'));
  const [current, setCurrent] = useState(null);
  const svgRef = useRef(null);
  const [warnings, setWarnings] = useState([]);
  const [brushSize, setBrushSize] = useState(24);

  useEffect(()=>{ localStorage.setItem('planner.elements', JSON.stringify(elements)); }, [elements]);
  useEffect(()=>{ localStorage.setItem('planner.materials', JSON.stringify(materials)); }, [materials]);
  useEffect(()=>{ localStorage.setItem('planner.masks', JSON.stringify(masks)); }, [masks]);

  function defaultMaterials(){
    return [
      { id: 'mat_concrete', name: 'Concrete', color: '#D1D5DB', texture: '/assets/textures/concrete.png', type:'structure' },
      { id: 'mat_brick', name: 'Brick', color: '#B7410E', texture: '/assets/textures/brick.png', type:'masonry' },
      { id: 'mat_wood', name: 'Wood', color: '#C29B6C', texture: '/assets/textures/wood.png', type:'finish' },
      { id: 'mat_marble', name: 'Marble', color: '#F3F4F6', texture: '/assets/textures/marble.png', type:'finish' },
      { id: 'mat_glass', name: 'Glass', color: '#D0F0FF', texture: '', type:'glazing' }
    ];
  }

  // helpers
  const mmToPx = mm => mm/scaleMMperPx;
  const pxToMm = px => px*scaleMMperPx;

  const snap = p => ({ x: Math.round(p.x/gridPx)*gridPx, y: Math.round(p.y/gridPx)*gridPx });
  function clientToSvg(e){ const svg=svgRef.current; const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(svg.getScreenCTM().inverse()); return {x:loc.x,y:loc.y}; }



// draw watermark (SVG) onto canvas context - used by exportPNG / exportPDF
async function drawWatermarkOnCanvas(ctx, canvas) {
  try {
    const resp = await fetch('/branding/ui/watermark.svg');
    if (!resp.ok) return;
    const svgText = await resp.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => { 
        // draw watermark at bottom-right with 20% opacity size ~ 200x60
        const w = Math.min(200, canvas.width * 0.25);
        const h = w * (60/200);
        ctx.globalAlpha = 0.20;
        ctx.drawImage(img, canvas.width - w - 20, canvas.height - h - 20, w, h);
        ctx.globalAlpha = 1.0;
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  } catch (e) {
    console.warn('watermark failed', e);
  }
}

  // Painting: assign material id to element or to mask region
  function applyMaterialToElement(elId, matId){
    setElements(prev => prev.map(el => el.id===elId ? {...el, material: matId} : el));
  }

  // Brush painting: for simplicity paint nearest element center within brush radius
  function brushPaintAt(p, matId){
    const radius = brushSize;
    let changed = false;
    setElements(prev => prev.map(el => {
      const cx = el.type==='wall' ? (el.x1+el.x2)/2 : (el.x||0);
      const cy = el.type==='wall' ? (el.y1+el.y2)/2 : (el.y||0);
      const d = Math.hypot(cx - p.x, cy - p.y);
      if(d <= radius){
        changed = true;
        return { ...el, material: matId };
      }
      return el;
    }));
    if(changed) console.log('brush applied');
  }

  // Masking: create polygon mask region assigned to an element or global layer
  function startMask(p){
    setCurrent({ type:'mask', points: [p] });
  }
  function addMaskPoint(p){
    setCurrent(c => c && c.type==='mask' ? {...c, points: [...c.points, p]} : c);
  }
  function finishMask(name, materialId){
    if(!current || current.type!=='mask') return;
    const mask = { id: Date.now(), name: name || `Mask-${Date.now()}`, points: current.points, material: materialId };
    setMasks(m=>[...m, mask]);
    setCurrent(null);
  }

  // Pointer events
  function onPointerDown(e){
    const p = snap(clientToSvg(e));
    if(tool==='wall'){ setCurrent({ type:'wall', x1:p.x, y1:p.y, x2:p.x, y2:p.y}); }
    else if(tool==='furniture'){ const id=Date.now(); setElements(s=>[...s,{ id, type:'furniture', x:p.x, y:p.y, w:mmToPx(1200), h:mmToPx(800), material: materials[0].id }]); }
    else if(tool==='paint'){ // apply material to clicked element
      const hit = findElementNear(p, 16);
      if(hit) applyMaterialToElement(hit.id, materials[0].id);
    } else if(tool==='brush'){ brushPaintAt(p, materials[0].id); setCurrent({ type:'brush' }); }
    else if(tool==='mask'){ startMask(p); }
    else if(tool==='erase'){ // erase element
      setElements(s=>s.filter(el=>!isNear(el,p,12))); setMasks(m=>m.filter(msk=>!pointInPolygon(p, msk.points))); }
  }
  function onPointerMove(e){
    if(!current) return;
    const p = snap(clientToSvg(e));
    if(current.type==='wall') setCurrent(c=>({...c, x2:p.x, y2:p.y}));
    else if(current.type==='brush'){ brushPaintAt(p, materials[0].id); }
    else if(current.type==='mask') addMaskPoint(p);
  }
  function onPointerUp(e){
    if(!current) return;
    if(current.type==='wall'){ if(Math.hypot(current.x2-current.x1, current.y2-current.y1)>6) setElements(s=>[...s, { id:Date.now(), ...current, material: materials[0].id }]); }
    if(current.type==='brush') setCurrent(null);
    if(current.type==='mask') { /* keep until user finishes */ }
  }

  // simple hit testing
  function findElementNear(p, thresh){
    for(const el of elements){
      if(el.type==='wall'){ const d = pointToSegmentDistance(p.x,p.y, el.x1,el.y1,el.x2,el.y2); if(d < thresh) return el; }
      else { const d = Math.hypot((el.x||0)-p.x, (el.y||0)-p.y); if(d < thresh) return el; }
    }
    return null;
  }
  function isNear(el,p,th){ if(el.type==='wall') return pointToSegmentDistance(p.x,p.y,el.x1,el.y1,el.x2,el.y2) < th; return Math.hypot((el.x||0)-p.x, (el.y||0)-p.y) < th; }

  function pointToSegmentDistance(px,py,x1,y1,x2,y2){ const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1; const dot=A*C+B*D; const len_sq=C*C+D*D; let param=-1; if(len_sq!==0) param=dot/len_sq; let xx,yy; if(param<0){xx=x1;yy=y1;} else if(param>1){xx=x2;yy=y2;} else {xx=x1+param*C; yy=y1+param*D;} return Math.hypot(px-xx,py-yy); }

  // polygon point-in-polygon (ray casting)
  function pointInPolygon(pt, vs){
    let x = pt.x, y = pt.y; let inside = false;
    for(let i=0,j=vs.length-1;i<vs.length;j=i++){
      const xi = vs[i].x, yi = vs[i].y; const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi>y)!=(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
      if(intersect) inside = !inside;
    }
    return inside;
  }

  // material management
  function addMaterial(mat){ setMaterials(m=>[...m, mat]); }

  // export snapshot (PNG) including masks & textures
  function exportPNG(){
    const svg = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob); const img = new Image();
    img.onload = async ()=>{ const canvas=document.createElement('canvas'); canvas.width=img.width; canvas.height=img.height; const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0); await drawWatermarkOnCanvas(ctx, canvas); const data = canvas.toDataURL('image/png'); const a=document.createElement('a'); a.href=data; a.download='mimar-plan.png'; a.click(); URL.revokeObjectURL(url); };
    img.src = url;
  }

  // small UI
  return (<div className="h-screen flex bg-gray-50 text-sm">
    <aside className="w-72 bg-white border-r p-3 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Mimar 1.1 — Materials & Masking</h2>
      <div className="flex flex-wrap gap-2">
        {['select','wall','door','window','furniture','paint','brush','mask','erase'].map(t=>(<button key={t} onClick={()=>setTool(t)} className={`px-3 py-1 rounded-md border ${tool===t?'bg-blue-600 text-white':'bg-white'}`}>{t}</button>))}
      </div>
      <div className="pt-2 border-t mt-2">
        <label className="block">Brush size (px)</label>
        <input type="range" min={4} max={120} value={brushSize} onChange={(e)=>setBrushSize(Number(e.target.value))} />
        <div className="text-xs text-gray-600">Brush: {brushSize}px</div>
      </div>
      <div className="pt-2 border-t mt-2">
        <div className="text-xs font-medium">Materials</div>
        <div className="flex gap-2 mt-2">
          {materials.map(mat=>(<button key={mat.id} onClick={()=>{ /* select material for painting */ setMaterials(ms=>ms.map(m=>m.id===mat.id?{...m,selected:true}:{...m,selected:false})); }} className="p-1 border rounded text-xs" title={mat.name}><span style={{display:'inline-block',width:24,height:16,background:mat.color, borderRadius:3}}></span> {mat.name}</button>))}
        </div>
        <button onClick={()=>{ const id=Date.now(); addMaterial({ id:'mat_custom_'+id, name:'Custom', color:'#ffffff', texture:'' }); }} className="mt-2 p-1 border rounded text-xs">Add material</button>
      </div>
      <div className="pt-2 border-t mt-2 flex flex-col gap-2">
        <button onClick={exportPNG} className="p-2 border rounded">Export PNG</button>
      </div>
    </aside>

    <main className="flex-1 relative">
      <svg ref={svgRef} viewBox={`0 0 ${1600} ${1000}`} className="w-full h-full bg-white" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <defs>
          <pattern id="grid" width={gridPx} height={gridPx} patternUnits="userSpaceOnUse"><path d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`} fill="none" stroke="#eee" strokeWidth="1"/></pattern>
          {/* textures as patterns */}
          <pattern id="tex_concrete" patternUnits="userSpaceOnUse" width="60" height="60"><image href="/assets/textures/concrete.png" x="0" y="0" width="60" height="60"/></pattern>
          <pattern id="tex_brick" patternUnits="userSpaceOnUse" width="60" height="60"><image href="/assets/textures/brick.png" x="0" y="0" width="60" height="60"/></pattern>
          <pattern id="tex_wood" patternUnits="userSpaceOnUse" width="60" height="60"><image href="/assets/textures/wood.png" x="0" y="0" width="60" height="60"/></pattern>
        </defs>
        <rect x={0} y={0} width={1600} height={1000} fill="url(#grid)" />
        {/* draw elements */}
        {elements.map(el=>{
          if(el.type==='wall') return (<g key={el.id}><line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="#333" strokeWidth={Math.max(1, 6)} strokeLinecap="round" /><text x={(el.x1+el.x2)/2} y={(el.y1+el.y2)/2-8} fontSize={12} textAnchor="middle">{Math.round(Math.hypot(el.x2-el.x1, el.y2-el.y1))} px</text></g>);
          if(el.type==='furniture') return (<g key={el.id} transform={`translate(${el.x},${el.y})`}><rect x={-el.w/2} y={-el.h/2} width={el.w} height={el.h} fill={materials.find(m=>m.id===el.material)?.color||'#e2e8f0'} stroke="#94a3b8" rx={6} /><text x={0} y={4} fontSize={10} textAnchor="middle">{el.label||'Furn'}</text></g>);
          return null;
        })}

        {/* masks */}
        {masks.map(msk=>(
          <g key={msk.id}>
            <polygon points={msk.points.map(p=>`${p.x},${p.y}`).join(' ')} fill={materials.find(m=>m.id===msk.material)?.color || 'rgba(255,255,255,0.2)'} stroke="#666" strokeDasharray="4 4" />
          </g>
        ))}

        {/* current drawing */}
        {current && current.type==='wall' && (<line x1={current.x1} y1={current.y1} x2={current.x2} y2={current.y2} stroke="#ff7b7b" strokeWidth={2} strokeDasharray="6 4" />)}
        {current && current.type==='mask' && (<polyline points={current.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#ff7b7b" strokeWidth={2} strokeDasharray="6 4" />)}
      </svg>
    </main>

    <aside className="w-80 bg-white border-l p-3 flex flex-col gap-3">
      <h3 className="font-semibold">Inspector</h3>
      <div className="flex-1 overflow-auto">
        <div className="text-xs text-gray-600">Materials count: {materials.length}</div>
        <div className="pt-2">
          <div className="text-xs font-medium">Masks</div>
          <ul className="mt-2 text-xs">{masks.map(m=> (<li key={m.id} className="p-1 border rounded">{m.name} — material: {m.material}</li>))}</ul>
        </div>
      </div>
    </aside>
  </div>);
}
