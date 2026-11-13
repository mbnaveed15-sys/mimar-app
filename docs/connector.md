# MIMAR connector for AI agents

MIMAR comes with a connector (a Model Context Protocol server) so an AI agent such as Claude can work on your
plans. It works on `.mimar` files on your own computer, with the same code the app uses.

## Turn it on (Windows, installed app)

1. In MIMAR, open **Help › Connect AI agents…** and press **Copy**.
2. In Claude Desktop, open **Settings › Developer › Edit Config** and paste the lines into the file
   (if it already has an `mcpServers` part, add only the `mimar` entry inside it).
3. Close Claude completely and open it again.

The lines look like this (the dialog fills in the real paths):

```json
{
  "mcpServers": {
    "mimar": {
      "command": "C:\\Users\\You\\AppData\\Local\\Programs\\MIMAR\\MIMAR.exe",
      "args": ["C:\\Users\\You\\AppData\\Local\\Programs\\MIMAR\\resources\\app.asar.unpacked\\dist-mcp\\mimar-mcp.mjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

From the source code instead: `npm run build`, then use `"command": "node"` and
`"args": ["<repo>/dist-mcp/mimar-mcp.mjs"]`.

## Using it

Give the agent the full path of a plan, for example: "Check `D:\Plans\House.mimar` against the bylaws and tell me
what fails", or "Make a new plan at `D:\Plans\Test.mimar` on a 35 ft by 65 ft CDA plot with 3 bedrooms, generate
the structure and export IFC". If the plan is open in MIMAR while the agent changes it, open it again to see the
changes (and don't save over them from the app).

## Tools

| Tool | What it does |
| --- | --- |
| `mimar_new_plan` | A new plan file, optionally with a rectangular plot, its authority and the project type |
| `mimar_describe_plan` | Floors, item counts, rooms with areas, plots |
| `mimar_get_items` | The raw items (by type, floor or id) |
| `mimar_add_walls` | Walls through a list of points; a closed loop makes a room |
| `mimar_add_room` | A room inside the walls round a point, with a name |
| `mimar_add_opening` | A door or window in the nearest wall |
| `mimar_add_furniture` | A library item (furniture, fixtures, service points) |
| `mimar_update_item` | Change fields of one item or room |
| `mimar_delete_items` | Delete items or rooms |
| `mimar_generate_layout` | Plan the ground floor from a room list on the plot |
| `mimar_generate_structure` | Columns, beams, slabs and footings from the walls |
| `mimar_check` | The plan check (bylaws, and a building's use) |
| `mimar_quantities` | Quantities for an estimate |
| `mimar_export` | DXF (one floor), IFC (the whole building) or the structure schedule (CSV) |
| `mimar_reference` | Lists: furniture kinds, authorities, project types and building uses |

Points and lengths in tool arguments are millimetres. Raw item JSON is as stored in the file: plan units of
10 mm, and fields ending in `Mm` in millimetres.
