"""Rebuild the bundled map from CCP's official SDE. Python standard library only."""
import io, json, pathlib, urllib.request, zipfile
url = "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip"
with urllib.request.urlopen(url) as response:
    archive = zipfile.ZipFile(io.BytesIO(response.read()))
rows = []
for line in archive.open("mapSolarSystems.jsonl"):
    record = json.loads(line)
    position = record.get("position")
    name = record.get("name", {}).get("en")
    if position and name:
        rows.append([record["_key"], name, record["securityStatus"],
                     *[position[axis] / 9.4607304725808e15 for axis in ("x", "y", "z")]])
rows.sort(key=lambda row: row[1].lower())
target = pathlib.Path(__file__).resolve().parents[1] / "public/data/map-systems.json"
target.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf8")
print(f"Wrote {len(rows)} systems to {target}")
