import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { distanceLy, gateGraph, jumpRange, routeRisk, shortestRoute, systemsInRange, type GateCheck, type GateKill, type JumpRules, type MapGate } from "../src/modules/map/travel";
import type { MapSystem } from "../src/modules/map/model";
const now=new Date("2026-10-03T12:00:00Z");
const kill=(id:number,destinationId:number,time="2026-10-03T11:30:00Z"):GateKill=>({id,time,gateId:10,destinationId,distanceKm:0,shipTypeId:587});
const check=(kills:GateKill[],complete=true):GateCheck=>({systemId:1,checkedAt:now.toISOString(),complete,missingPositions:0,kills});
afterEach(()=>vi.useRealTimers());
describe("travel planning",()=>{
 it("finds the fewest-gate route, handles cycles and disconnected systems",()=>{
  const g=new Map([[1,[2,4]],[2,[1,3]],[3,[2,4]],[4,[1,3,5]],[5,[4]]]);
  expect(shortestRoute(g,1,5)).toEqual([1,4,5]);expect(shortestRoute(g,1,1)).toEqual([1]);expect(shortestRoute(g,1,9)).toBeNull();
 });
 it("contains a real Jita–Perimeter gate route",()=>{
  const data=JSON.parse(readFileSync("public/data/map-gates.json","utf8")) as MapGate[];
  expect(shortestRoute(gateGraph(data),30000142,30000144)).toEqual([30000142,30000144]);
 });
 it("does not mark unrelated gates red or incomplete checks green",()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const other=check([kill(1,3)]);
  expect(routeRisk(other,[1,2])).toBe("green");expect(routeRisk(other,[1,3])).toBe("red");
  expect(routeRisk({...other,complete:false},[1,2])).toBe("unknown");
  expect(routeRisk(undefined,[1,2])).toBe("unknown");
 });
 it("removes cached kills once they leave the two-hour window",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
  expect(routeRisk(check([kill(1,2)]),[1,2])).toBe("green");
 });
});
describe("jump ranges",()=>{
 const rules=JSON.parse(readFileSync("public/data/map-jump-rules.json","utf8")) as JumpRules;
 it("uses CCP hull ranges and the skill multiplier",()=>{
  expect(jumpRange(rules,"carrier",5)).toBe(7);expect(jumpRange(rules,"freighter",5)).toBe(10);expect(jumpRange(rules,"blackops",5)).toBe(8);
  expect(jumpRange(rules,"carrier",0)).toBe(3.5);expect(jumpRange(rules,"blackops",4)).toBe(7.2);
 });
 it("computes actual 3D distance and includes the range boundary",()=>{
  const origin:MapSystem=[30000001,"Origin",0,0,0,0],near:MapSystem=[30000002,"Near",0,3,4,0],far:MapSystem=[30000003,"Far",0,3,4,1],wh:MapSystem=[31000001,"WH",-1,0,0,0];
  expect(distanceLy(origin,near)).toBe(5);expect(systemsInRange([origin,near,far,wh],origin,5)).toEqual([near]);expect(systemsInRange([near],wh,10)).toEqual([]);
 });
});
