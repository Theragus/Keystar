"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { type MapSystem } from "./model";
import { createMapRenderer } from "./renderer";
import { MapPlanning } from "./planning";
import { EMPTY_OVERLAY } from "./travel";
import { Panel } from "@/components/ui/glass";

export function UniverseMap() {
 const { t, f } = useI18n(); const m = t.map;
 const [systems, setSystems] = useState<MapSystem[]>([]);
 const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
 const [query, setQuery] = useState(""); const [space, setSpace] = useState("known");
 const [selected, setSelected] = useState<MapSystem | null>(null); const [labels, setLabels] = useState(true);
 const camera = useRef({ yaw: 0, pitch: .6, zoom: 1.4 });
 const redraw = useRef<() => void>(() => {});
 const [listTop, setListTop] = useState(0);
 const [listRows, setListRows] = useState(24);
 const list = useRef<HTMLDivElement>(null);
 const setCamera = (update: typeof camera.current | ((c: typeof camera.current) => typeof camera.current)) => {
  camera.current = typeof update === "function" ? update(camera.current) : update;
  redraw.current();
 };
 const [overlay, setOverlay] = useState(EMPTY_OVERLAY);
 const overlayRef = useRef(EMPTY_OVERLAY);
 useEffect(() => { overlayRef.current = overlay; redraw.current(); }, [overlay]);
 const canvas = useRef<HTMLCanvasElement>(null);
 const hits = useRef<{system: MapSystem; x: number; y: number}[]>([]);
 const drag = useRef<{x: number; y: number; moved: boolean} | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  fetch("/data/map-systems.json", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setSystems).catch(e => { if (e.name !== "AbortError") setError(true); });
  return () => controller.abort();
 }, [attempt]);
 const visible = useMemo(() => systems.filter(s => space === "all" || (space === "wormholes" ? s[0] >= 31000000 && s[0] < 32000000 : s[0] < 31000000)), [systems, space]);
 useEffect(() => {
  const el = list.current; if (!el) return;
  const observer = new ResizeObserver(() => setListRows(Math.ceil(el.clientHeight / 32) + 2));
  observer.observe(el); return () => observer.disconnect();
 }, []);
 const matches = useMemo(() => visible.filter(s => s[1].toLowerCase().includes(query.trim().toLowerCase())), [visible, query]);
 useEffect(() => {
  const el = canvas.current; if (!el || !visible.length) return;
  const renderer = createMapRenderer(el, visible, {
   overlay: () => overlayRef.current, camera: () => camera.current, dragging: () => !!drag.current?.moved,
   selected: selected?.[0] ?? null, query, labels, format: value => f.number(value, 1),
   onHits: points => { hits.current = points; },
  });
  redraw.current = renderer.schedule;
  renderer.schedule();
  return () => { renderer.destroy(); redraw.current = () => {}; };
 }, [visible, selected, query, labels, f]);
 const button = "glass-chip rounded-md px-3 py-1.5 text-xs text-ink-2 hover:text-ink transition-colors";
 const choose = (s: MapSystem) => { setSelected(s); setCamera(c => ({...c,zoom:Math.max(c.zoom,5)})); };
 return <div className="space-y-3"><Panel title={m.universe} subtitle={m.controls} actions={<span className="text-xs font-semibold tabular-nums text-ink-2">{f.integer(visible.length)} {m.systems}</span>} bodyClassName="px-3 pb-3">
  <div className="mb-3 flex flex-wrap items-center gap-2">
   <input aria-label={m.search} placeholder={m.search} value={query} onChange={e => {setQuery(e.target.value);setListTop(0);if(list.current)list.current.scrollTop=0;}} className="glass-inset min-w-48 rounded-md px-3 py-2 text-xs text-ink"/>
   <select aria-label={m.systems} value={space} onChange={e => {setSpace(e.target.value);setSelected(null);setListTop(0);if(list.current)list.current.scrollTop=0;setCamera({yaw:0,pitch:.6,zoom:1.4});}} className="glass-inset rounded-md px-3 py-2 text-xs text-ink"><option value="known">{m.known}</option><option value="wormholes">{m.wormholes}</option><option value="all">{m.all}</option></select>
   <button className={button} onClick={() => {setSelected(null);setCamera({yaw:0,pitch:.6,zoom:1.4});}}>{m.reset}</button>
   <button className={button} aria-label={m.zoomIn} onClick={() => setCamera(c => ({...c,zoom:Math.min(100,c.zoom*1.4)}))}>+</button>
   <button className={button} aria-label={m.zoomOut} onClick={() => setCamera(c => ({...c,zoom:Math.max(.3,c.zoom/1.4)}))}>−</button>
   <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/>{m.labels}</label>
  </div>
  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
   <div className="glass-inset relative min-w-0 overflow-hidden rounded-lg">
    <canvas ref={canvas} aria-label={m.canvas} className="h-[65vh] min-h-96 w-full text-ink touch-none cursor-grab"
     onPointerDown={e => {drag.current={x:e.clientX,y:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e => {const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;setCamera(c => ({...c,yaw:c.yaw+dx*.006,pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,c.pitch+dy*.006))}));d.x=e.clientX;d.y=e.clientY;}}
     onPointerCancel={() => {drag.current=null;redraw.current();}}
     onPointerUp={e => {if(drag.current && !drag.current.moved){const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;const p=hits.current.reduce<{system:MapSystem;x:number;y:number}|null>((best,p) => Math.hypot(p.x-x,p.y-y)<Math.min(12,best?Math.hypot(best.x-x,best.y-y):12)?p:best,null);if(p)choose(p.system);}drag.current=null;redraw.current();}}
     onWheel={e => setCamera(c => ({...c,zoom:Math.max(.3,Math.min(100,c.zoom*Math.exp(-e.deltaY*.001)))}))}/>
    {!systems.length && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-ink-2">{error ? <button onClick={() => {setError(false);setAttempt(a=>a+1);}}>{m.error} · {m.retry}</button> : m.loading}</div>}
   </div>
   <aside className="glass-inset flex min-h-0 flex-col rounded-lg p-3">
    {selected && <div className="mb-3 border-b border-surface-contrast/10 pb-3"><div className="font-semibold text-ink">{selected[1]}</div><div className="mt-1 text-sm text-ink-2">{m.security}: {f.number(selected[2],1)}</div></div>}
    <div className="eve-label mb-2 text-2xs text-ink-3">{m.systems} · {f.number(matches.length)}</div>
    <div ref={list} onScroll={e => setListTop(e.currentTarget.scrollTop)} className="h-72 overflow-y-auto lg:h-[55vh]">{matches.length===0 && systems.length>0 && <p className="p-3 text-xs text-ink-2">{m.empty}</p>}<div className="relative" style={{height:matches.length*32}}>{matches.slice(Math.floor(listTop/32), Math.floor(listTop/32)+listRows).map((s,i) => <button style={{position:"absolute",top:(Math.floor(listTop/32)+i)*32,height:32}} aria-pressed={selected?.[0]===s[0]} key={s[0]} onClick={() => choose(s)} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-surface-contrast/5 ${selected?.[0]===s[0]?"bg-surface-contrast/5 text-accent":"text-ink-2"}`}><span>{s[1]}</span><span className="font-mono">{f.number(s[2],1)}</span></button>)}</div></div>
   </aside>
  </div>
  <div className="flex flex-wrap justify-between gap-3 border-t border-surface-contrast/10 p-3 text-xs text-ink-2"><div className="flex gap-4">{(["high","low","null"] as const).map((key,i) => <span key={key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:`var(--series-${["ice","gas","ore"][i]})`}}/>{m[key]}</span>)}</div><a href="https://developers.eveonline.com/static-data/" target="_blank" rel="noreferrer">{m.source}</a></div>
 </Panel><MapPlanning systems={systems} selected={selected} onFocus={choose} onOverlay={setOverlay}/></div>;
}

