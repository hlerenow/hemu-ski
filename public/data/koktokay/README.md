# Koktokay map data

Generated with `npm run fetch-koktokay` using the same baker as Hemu.

- Origin: OpenStreetMap [node 9406749601](https://www.openstreetmap.org/node/9406749601), the Koktokay ski resort point, at 90.05679° E, 47.18862° N (WGS84).
- Editable detail: 9.6 × 9.6 km, 8 m grid, centered 700 m west and 700 m south of that origin. `detail.u16` stores quantized elevations; bounds and scale are in `world.json`.
- Snow mountain backdrop: 30 × 30 km, 125 m grid, centered on the origin. `backdrop.u16` stores quantized elevations.
- Elevation source: [AWS Terrain Tiles Terrarium](https://registry.opendata.aws/terrain-tiles/), zoom 14 for detail and zoom 11 for backdrop. The baker softens the roughly 30 m source DEM for the 8 m grid.
- Runs and lifts: [OpenStreetMap](https://www.openstreetmap.org/copyright) ways queried through Overpass. Their names and difficulty tags are copied as mapped, including `（预估）` on some off-piste routes. Named lift stations and the resort marker come from OSM nodes. Names are map annotations, not a safety or opening-status guide.
- Ski hall: a 3D editor object placed approximately 95 m south of the OSM resort marker. OSM does not provide a surveyed building footprint here, so its position, orientation and 62 × 22 m visible building size are estimates that can be adjusted in the editor. The lift lines and stations follow the OSM aerialway ways; their 3D buildings, towers and cars are visual models.
- Forest: no OSM `natural=wood` or `landuse=forest` polygons were returned for the ski area. The editor places an **estimated** forest from elevation, slope and distance from runs and lifts; these trees are not surveyed positions.

Editor saves go in `edits/`, separate from Hemu's edits. The untouched bake remains in this directory.
