# AGENTS.md

Conventions for working in this repository.

## README

- READMEの文章は簡潔に保つ。表と短い行を優先し、表やコードが既に示している内容を説明文で繰り返さない。
- Keep every fact (stage / mode / era-pack lists, URL parameters, controls, verification) — cut prose, not facts.

## Code

- Plain JavaScript (ES modules), Vite, three.js. No new dependencies.
- UI text is Japanese; code comments are English.
- Simulation-affecting randomness goes through the seeded PRNG in `src/util.js` (`rand`, `randRange`, `pick`, `setSeed`). `Math.random()` / `cosmeticRand` is render/audio only and must never feed back into the simulation — the determinism guarantee (same stage/size/mode/seed → identical result, pinned by `npm test`) depends on it.
- Do not change the default (Rome) era pack's behaviour: `npm test` compares a field/S/seed-7 snapshot against `tools/baseline.json`. Regenerate the baseline only for intentional simulation changes, and say so in the commit message.
- Era packs live in `src/eras/` and register through `src/eras/index.js`; new units ride existing kinds (`K_INF` / `K_CAV` / …) and the weapon tables instead of new engine branches where possible.
- Firearms stop at matchlock level — no line-infantry / field-artillery eras.
- Verify before committing: `npm test`, `npm run build`, and a `tools/bench.mjs` smoke over the stages you touched (`node tools/ui-check.mjs` for UI changes; `node tools/facing-probe.mjs` after touching pose/render rigs).
