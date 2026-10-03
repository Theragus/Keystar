import type { MapSystem } from "./model";
import { securityClass } from "./model";

type Hit = { system: MapSystem; x: number; y: number };
type Options = {
 camera: () => { yaw: number; pitch: number; zoom: number };
 dragging: () => boolean; selected: number | null; query: string; labels: boolean;
 format: (value: number) => string; onHits: (hits: Hit[]) => void;
};

/** One frame per repaint; geometry, text and theme measurements are cached outside the hot path. */
export function createMapRenderer(canvas: HTMLCanvasElement, systems: MapSystem[], options: Options) {
 const ctx = canvas.getContext("2d");
 if (!ctx) return { schedule() {}, destroy() {} };
 const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
 for (const s of systems) for (let i=0;i<3;i++) { min[i]=Math.min(min[i],s[i+3] as number); max[i]=Math.max(max[i],s[i+3] as number); }
 const focus = systems.find(s => s[0]===options.selected);
 const center = focus ? focus.slice(3) as number[] : min.map((v,i)=>(v+max[i])/2);
 const range = Math.max(...max.map((v,i)=>v-min[i]),1);
 const query = options.query.trim().toLowerCase();
 ctx.font="11px Inter, sans-serif";
 const points = systems.map(s => {
  const label = `${s[1]} · ${options.format(s[2])}`;
  return {system:s,x:s[3]-center[0],y:s[4]-center[1],z:s[5]-center[2],
   label,width:ctx.measureText(label).width,match:!query || s[1].toLowerCase().includes(query),
   group:securityClass(s[2]),hit:{system:s,x:0,y:0}};
 });
 let width=0,height=0, frame=0, destroyed=false;
 let ink="", colors: Record<string,string>={};
 function theme() {
  const style=getComputedStyle(canvas); ink=style.color;
  colors={high:style.getPropertyValue("--series-ice").trim(),low:style.getPropertyValue("--series-gas").trim(),null:style.getPropertyValue("--series-ore").trim()};
 }
 function resize() {
  width=canvas.clientWidth; height=canvas.clientHeight;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx!.setTransform(dpr,0,0,dpr,0,0);ctx!.font="11px Inter, sans-serif";
  schedule();
 }
 function draw() {
  frame=0;if(destroyed || !ctx)return;
  const c=options.camera(), sy=Math.sin(c.yaw),cy=Math.cos(c.yaw),sp=Math.sin(c.pitch),cp=Math.cos(c.pitch);
  const scale=Math.min(width,height)*.8/range*c.zoom;
  ctx.clearRect(0,0,width,height);
  const hits: Hit[]=[];
  // Batch stars into just six paths instead of issuing thousands of individual fills.
  const paths: Record<string,Path2D>={};
  const onScreen: typeof points=[];
  for(const p of points) {
   const x=width/2+(p.x*cy-p.z*sy)*scale;
   const y=height/2-(p.y*cp-(p.x*sy+p.z*cy)*sp)*scale;
   p.hit.x=x;p.hit.y=y;
   if(x<0||y<0||x>width||y>height)continue;
   hits.push(p.hit);onScreen.push(p);
   const key=`${p.group}:${p.match}`;const path=paths[key]??(paths[key]=new Path2D());
   path.rect(x-1.5,y-1.5,3,3);
  }
  for(const [key,path] of Object.entries(paths)) {
   const [group,match]=key.split(":");ctx.fillStyle=colors[group]||ink;ctx.globalAlpha=match==="true"?.85:.12;ctx.fill(path);
  }
  options.onHits(hits);ctx.globalAlpha=1;
  if(focus) {
   ctx.strokeStyle=ink;ctx.beginPath();ctx.arc(width/2,height/2,7,0,Math.PI*2);ctx.stroke();
  }
  // Detailed labels return immediately after interaction; moving frames only draw stars.
  if(options.dragging())return;
  ctx.fillStyle=ink;
  const occupied=new Set<string>();let count=0;
  for(const p of onScreen) {
   const active=p.system[0]===options.selected;
   if(!active && (!options.labels||!p.match||count>=100))continue;
   const x=p.hit.x+7,y=p.hit.y-5;
   const cells:string[]=[];
   for(let col=Math.floor(x/32);col<=Math.floor((x+p.width+4)/32);col++)
    for(let row=Math.floor((y-12)/16);row<=Math.floor((y+4)/16);row++)cells.push(`${col}:${row}`);
   if(!active && cells.some(cell=>occupied.has(cell)))continue;
   ctx.fillText(p.label,x,y);cells.forEach(cell=>occupied.add(cell));count++;
  }
 }
 function schedule() {if(!frame&&!destroyed)frame=requestAnimationFrame(draw);}
 theme();resize();
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 const mutation=new MutationObserver(()=>{theme();schedule();});mutation.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-theme"]});
 return { schedule, destroy() {destroyed=true;cancelAnimationFrame(frame);observer.disconnect();mutation.disconnect();} };
}
