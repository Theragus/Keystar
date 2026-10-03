import { describe, expect, it } from "vitest";
import { countBy, layoutFleet, stripMarkup } from "@/modules/fleet/logic";

const member = (characterId: number, role: string, wingId: number, squadId: number) => ({ characterId, role, wingId, squadId });

describe("layoutFleet", () => {
  const wings = [
    { id: 10, name: "Main", squads: [{ id: 100, name: "DPS" }, { id: 101, name: "Logi" }, { id: 102, name: "Empty" }] },
    { id: 11, name: "Unused", squads: [{ id: 110, name: "Nobody" }] },
  ];

  it("puts the fleet commander first and members into their wings and squads", () => {
    const layout = layoutFleet(
      [
        member(4, "squad_member", 10, 101),
        member(2, "wing_commander", 10, -1),
        member(3, "squad_commander", 10, 100),
        member(5, "squad_member", 10, 100),
        member(1, "fleet_commander", -1, -1),
      ],
      wings,
    );
    expect(layout.command.map((m) => m.characterId)).toEqual([1]);
    expect(layout.wings).toHaveLength(1);
    const [wing] = layout.wings;
    expect(wing.commanders.map((m) => m.characterId)).toEqual([2]);
    expect(wing.squads.map((s) => [s.name, s.members.map((m) => m.characterId)])).toEqual([
      ["DPS", [3, 5]],
      ["Logi", [4]],
    ]);
  });

  it("keeps members whose wing or squad is missing from the wings list", () => {
    const layout = layoutFleet([member(7, "squad_member", 99, 999)], wings);
    expect(layout.wings).toEqual([
      { id: 99, name: "", commanders: [], squads: [{ id: 999, name: "", members: [member(7, "squad_member", 99, 999)] }] },
    ]);
  });
});

describe("countBy", () => {
  it("counts per key, largest first and ties by label", () => {
    const ships = [
      { id: 1, name: "Guardian" },
      { id: 2, name: "Muninn" },
      { id: 2, name: "Muninn" },
      { id: 3, name: "Basilisk" },
    ];
    expect(countBy(ships, (s) => s.id, (s) => s.name)).toEqual([
      { key: 2, label: "Muninn", count: 2 },
      { key: 3, label: "Basilisk", count: 1 },
      { key: 1, label: "Guardian", count: 1 },
    ]);
  });
});

describe("stripMarkup", () => {
  it("turns EVE rich text into plain text", () => {
    expect(stripMarkup('<font size="12" color="#ffffffff">Form up in </font><a href="showinfo:5//30000142">Jita</a><br>x-up &amp; align'))
      .toBe("Form up in Jita\nx-up & align");
  });
});
