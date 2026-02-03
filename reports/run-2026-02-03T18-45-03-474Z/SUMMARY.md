# CI Summary

## Environment
- Node: v22.17.0
- Platform: darwin
- Browser: 145.0.7632.6
- Mode: headless
- Base URL: http://127.0.0.1:5173

## Benchmarks
| Scenario | Avg FPS | 1% Low FPS | P99 Frame (ms) | Worst Frame (ms) | Draw Calls | Triangles | Chunks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 30.4 | 30.3 | 33 | 33 | 14 | 6352 | 9 |
| B | 30.5 | 30.3 | 33 | 33 | 10 | 5162 | 9 |
| C | 30.4 | 30.3 | 33 | 33 | 23 | 7138 | 9 |

## Smoke Tests
- Status: PASS

## WebGL Info
```json
{
  "webgl": true,
  "webgl2": false,
  "webglVersion": "WebGL 1.0 (OpenGL ES 2.0 Chromium)",
  "webgl2Version": null,
  "renderer": "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)",
  "vendor": "Google Inc. (Google)",
  "renderer2": null,
  "vendor2": null
}
```

## Console Errors
- console.log: Atlas inicializálása...
- console.log: Textúrák betöltése...
- console.warning: [.WebGL-0x10c00198a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- console.warning: [.WebGL-0x10c001a0e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- console.warning: [.WebGL-0x10c00198a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- console.warning: [.WebGL-0x10c00198a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (this message will no longer repeat)
- console.log: Textúrák betöltve!
- console.log: Atlas kész!
