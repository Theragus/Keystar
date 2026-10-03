"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { project, securityClass, type MapSystem } from "./model";

export function UniverseMap() {
 const { t, f } = useI18n(); const m = t.map;
 const [systems, setSystems] = useState<MapSystem[]>([]);
 const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
 const [query, setQuery] = useState(""); const [space, setSpace] = useState("known");
 const [selected, setSelected] = useState<MapSystem | null>(null); const [labels, setLabels] = useState(true);
 const [camera, setCamera] = useState({ yaw: 0, pitch: .6, zoom: 1 });
 const canvas = useRef<HTMLCanvasElement>(null);
 const hits = useRef<{system: MapSystem; x: number; y: number}[]>([]);
 const drag = useRef<{x: number; y: number; moved: boolean} | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  fetch("/data/map-systems.json", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setSystems).catch(e => { if (e.name !== "AbortError") setError(true); });
  return () => controller.abort();
 }, [attempt]);
 const visible = useMemo(() => systems.filter(s => space === "all" || (space === "wormholes" ? s[0] >= 31000000 && s[0] < 32000000 : s[0] < 31000000)), [systems, space]);
 const matches = useMemo(() => visible.filter(s => s[1].toLowerCase().includes(query.trim().toLowerCase())), [visible, query]);
 useEffect(() => {
  const el = canvas.current; if (!el || !visible.length) return;
  const ctx = el.getContext("2d"); if (!ctx) return;
  function draw() {
   if (!el || !ctx) return;
   const w = el.clientWidth, h = el.clientHeight, dpr = window.devicePixelRatio || 1;
   el.width = w*dpr; el.height = h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
   const style = getComputedStyle(el); const ink = style.color;
   const colors = {high: style.getPropertyValue("--series-ice").trim(), low: style.getPropertyValue("--series-gas").trim(), null: style.getPropertyValue("--series-ore").trim()};
   const mins = [0,1,2].map(i => Math.min(...visible.map(s => s[i+3] as number)));
   const maxs = [0,1,2].map(i => Math.max(...visible.map(s => s[i+3] as number)));
   const center = selected ? selected.slice(3) as number[] : mins.map((v,i) => (v+maxs[i])/2);
   const range = Math.max(...maxs.map((v,i) => v-mins[i]),1);
   const scale = Math.min(w,h)*.8/range*camera.zoom;
   ctx.clearRect(0,0,w,h); hits.current=[];
   const points = visible.map(system => { const p = project(system[3]-center[0],system[4]-center[1],system[5]-center[2],camera.yaw,camera.pitch); return {system,x:w/2+p.x*scale,y:h/2-p.y*scale,z:p.z}; }).sort((a,b) => a.z-b.z);
   const occupied: {x:number;y:number;w:number}[] = [];
   for (const p of points) {
    if (p.x<0 || p.y<0 || p.x>w || p.y>h) continue;
    const active = p.system[0] === selected?.[0], match = !query || p.system[1].toLowerCase().includes(query.toLowerCase().trim());
    ctx.globalAlpha = match ? .9 : .12;
    ctx.fillStyle = colors[securityClass(p.system[2])] || ink;
    ctx.beginPath(); ctx.arc(p.x,p.y,active ? 5 : 2,0,Math.PI*2); ctx.fill();
    hits.current.push(p);
    const label = `${p.system[1]} · ${f.number(p.system[2],1)}`;
    ctx.font="11px Inter, sans-serif";
    const width = ctx.measureText(label).width;
    const overlaps = occupied.some(r => Math.abs(r.y-p.y)<16 && p.x+7<r.x+r.w+5 && p.x+7+width+5>r.x);
    if (active || (labels && match && !overlaps)) {
     ctx.globalAlpha = 1; ctx.fillStyle=ink; ctx.font="11px Inter, sans-serif";
     ctx.fillText(label,p.x+7,p.y-5); occupied.push({x:p.x+7,y:p.y,w:width});
    }
   }
   ctx.globalAlpha=1;
  }
  draw(); const observer = new ResizeObserver(draw); observer.observe(el);
  const theme = new MutationObserver(draw); theme.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-theme"]});
  return () => { observer.disconnect(); theme.disconnect(); };
 }, [visible, camera, selected, query, labels, f]);
 const button = "rounded-md border border-surface-contrast/10 px-3 py-1.5 text-xs text-ink-2 hover:bg-surface-contrast/5";
 const choose = (s: MapSystem) => { setSelected(s); setCamera(c => ({...c,zoom:Math.max(c.zoom,5)})); };
 return <section className="overflow-hidden rounded-xl border border-surface-contrast/10 bg-space-900">
  <div className="flex flex-wrap items-center gap-3 border-b border-surface-contrast/10 p-3">
   <input aria-label={m.search} placeholder={m.search} value={query} onChange={e => setQuery(e.target.value)} className="min-w-48 rounded-md border border-surface-contrast/10 bg-space-900 px-3 py-2 text-sm text-ink"/>
   <select aria-label={m.systems} value={space} onChange={e => {setSpace(e.target.value);setSelected(null);setCamera({yaw:0,pitch:.6,zoom:1});}} className="rounded-md border border-surface-contrast/10 bg-space-900 px-3 py-2 text-sm text-ink"><option value="known">{m.known}</option><option value="wormholes">{m.wormholes}</option><option value="all">{m.all}</option></select>
   <button className={button} onClick={() => {setSelected(null);setCamera({yaw:0,pitch:.6,zoom:1});}}>{m.reset}</button>
   <button className={button} aria-label={m.zoomIn} onClick={() => setCamera(c => ({...c,zoom:Math.min(100,c.zoom*1.4)}))}>+</button>
   <button className={button} aria-label={m.zoomOut} onClick={() => setCamera(c => ({...c,zoom:Math.max(.3,c.zoom/1.4)}))}>−</button>
   <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/>{m.labels}</label>
  </div>
  <div className="grid lg:grid-cols-[minmax(0,1fr)_240px]">
   <div className="relative min-w-0">
    <canvas ref={canvas} aria-label={m.canvas} className="h-[65vh] min-h-96 w-full text-ink touch-none cursor-grab"
     onPointerDown={e => {drag.current={x:e.clientX,y:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e => {const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;setCamera(c => ({...c,yaw:c.yaw+dx*.006,pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,c.pitch+dy*.006))}));d.x=e.clientX;d.y=e.clientY;}}
     onPointerCancel={() => {drag.current=null;}}
     onPointerUp={e => {if(drag.current && !drag.current.moved){const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;const p=hits.current.reduce<{system:MapSystem;x:number;y:number}|null>((best,p) => Math.hypot(p.x-x,p.y-y)<Math.min(12,best?Math.hypot(best.x-x,best.y-y):12)?p:best,null);if(p)choose(p.system);}drag.current=null;}}
     onWheel={e => setCamera(c => ({...c,zoom:Math.max(.3,Math.min(100,c.zoom*Math.exp(-e.deltaY*.001)))}))}/>
    {!systems.length && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-ink-2">{error ? <button onClick={() => {setError(false);setAttempt(a=>a+1);}}>{m.error} · {m.retry}</button> : m.loading}</div>}
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-space-900/90 px-3 py-2 text-xs text-ink-2">{m.controls}</div>
   </div>
   <aside className="border-t border-surface-contrast/10 lg:border-t-0 lg:border-l">
    {selected && <div className="border-b border-surface-contrast/10 p-4"><div className="font-semibold text-ink">{selected[1]}</div><div className="mt-1 text-sm text-ink-2">{m.security}: {f.number(selected[2],1)}</div></div>}
    <div className="px-3 py-2 text-xs text-ink-2">{m.systems} · {f.number(matches.length)}</div>
    <div className="max-h-[55vh] overflow-y-auto">{matches.length===0 && systems.length>0 && <p className="p-3 text-xs text-ink-2">{m.empty}</p>}{matches.map(s => <button key={s[0]} onClick={() => choose(s)} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-surface-contrast/5 ${selected?.[0]===s[0]?"bg-surface-contrast/5 text-accent":"text-ink-2"}`}><span>{s[1]}</span><span className="font-mono">{f.number(s[2],1)}</span></button>)}</div>
   </aside>
  </div>
  <div className="flex flex-wrap justify-between gap-3 border-t border-surface-contrast/10 p-3 text-xs text-ink-2"><div className="flex gap-4">{(["high","low","null"] as const).map((key,i) => <span key={key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:`var(--series-${["ice","gas","ore"][i]})`}}/>{m[key]}</span>)}</div><a href="https://developers.eveonline.com/static-data/" target="_blank" rel="noreferrer">{m.source}</a></div>
 </section>;
}

