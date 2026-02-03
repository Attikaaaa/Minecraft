# Performance Report (Meshing Worker)

Environment:
- Browser: Playwright Chromium (headless) with `--use-gl=angle --use-angle=swiftshader`
- Build mode: dev (static `http.server`)
- URL params: `bench=1&realtime=1&seed=1337&nopointerlock=1`
- Measurement date: 2026-02-03

## Scenario A (stand still 30s)

Main-thread meshing:
- Avg FPS: 30.5
- 1% low FPS: 30.3
- Avg frame: 32.803ms
- 99p frame: 33.000ms
- Worst frame: 33.000ms
- Draw calls: 18
- Tris: 6400
- Chunks rendered: 9
- Timings (ms): render 0.490, worldTick 1.767, meshingApply 1.209, waterTick 0.002, ui 0.136

Worker meshing:
- Avg FPS: 30.5
- 1% low FPS: 30.3
- Avg frame: 32.735ms
- 99p frame: 33.000ms
- Worst frame: 33.000ms
- Draw calls: 17
- Tris: 6388
- Chunks rendered: 9
- Timings (ms): render 0.638, worldTick 3.660, meshingApply 2.921, waterTick 0.003, ui 0.169

## Scenario B (auto-sprint forward 30s)

Main-thread meshing:
- Avg FPS: 30.6
- 1% low FPS: 30.3
- Avg frame: 32.712ms
- 99p frame: 33.000ms
- Worst frame: 33.000ms
- Draw calls: 10
- Tris: 5162
- Chunks rendered: 9 (world size 12)
- Timings (ms): render 2.248, worldTick 2.704, meshingApply 1.936, waterTick 0.002, ui 0.142

Worker meshing:
- Avg FPS: 30.5
- 1% low FPS: 30.3
- Avg frame: 32.762ms
- 99p frame: 33.000ms
- Worst frame: 33.000ms
- Draw calls: 15
- Tris: 7858
- Chunks rendered: 9 (world size 12)
- Timings (ms): render 4.036, worldTick 3.496, meshingApply 2.597, waterTick 0.002, ui 0.152

## Scenario C (place/break spam 30s)

Main-thread meshing:
- Avg FPS: 30.4
- 1% low FPS: 30.3
- Avg frame: 32.906ms
- 99p frame: 33.000ms
- Worst frame: 33.000ms
- Draw calls: 20
- Tris: 6424
- Chunks rendered: 9
- Timings (ms): render 0.518, worldTick 6.662, meshingApply 6.135, waterTick 0.004, ui 0.128

Worker meshing:
- Avg FPS: 30.4
- 1% low FPS: 30.3
- Avg frame: 32.872ms
- 99p frame: 33.000ms
- Worst frame: 33.000ms
- Draw calls: 16
- Tris: 7054
- Chunks rendered: 9
- Timings (ms): render 0.578, worldTick 7.706, meshingApply 6.991, waterTick 0.007, ui 0.176

## Notes

- Headless runs are capped to ~30 FPS by the test harness in this environment; expect higher FPS in a real desktop browser.
- Worker path verified via `mesher=main` comparison; all scenarios now complete without errors.
- Next step for clearer worker benefit: run the same scenarios in a real browser (non-headless) to see reduced main-thread spikes during heavy meshing.
