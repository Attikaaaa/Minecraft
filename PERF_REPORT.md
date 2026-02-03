# Perf Report

Environment
- Date:
- Browser:
- Build mode: (dev/prod)
- Notes:

How to run
- Open the game with `?bench=1&scenario=A` (or `B`, `C`). Bench runs use a fixed seed when `bench=1`.
- The console prints a `PERF_BENCH` JSON line after ~30s. Copy the metrics below.

Scenario A (Stand still at spawn, 30s)
- URL: `?bench=1&scenario=A`
- avg fps:
- 1% low fps (or p99 frame time):
- avg frame time (ms):
- p99 frame time (ms):
- worst frame time (ms):
- draw calls:
- triangles:
- chunks rendered:
- timings (ms): render, worldTick, meshingApply, waterTick, ui
- queue lengths: gen, mesh, water, dirty

Scenario B (Auto-sprint forward, 30s)
- URL: `?bench=1&scenario=B`
- avg fps:
- 1% low fps (or p99 frame time):
- avg frame time (ms):
- p99 frame time (ms):
- worst frame time (ms):
- draw calls:
- triangles:
- chunks rendered:
- timings (ms): render, worldTick, meshingApply, waterTick, ui
- queue lengths: gen, mesh, water, dirty

Scenario C (Place/break spam in front, 30s)
- URL: `?bench=1&scenario=C`
- avg fps:
- 1% low fps (or p99 frame time):
- avg frame time (ms):
- p99 frame time (ms):
- worst frame time (ms):
- draw calls:
- triangles:
- chunks rendered:
- timings (ms): render, worldTick, meshingApply, waterTick, ui
- queue lengths: gen, mesh, water, dirty
