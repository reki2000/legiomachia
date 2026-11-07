# Legiomachia

Ancient-to-gunpowder battle simulator in the browser (WebGL / three.js, plain JavaScript, no build-time assets).

**Live demo: https://reki2000.github.io/legiomachia/**

```
npm install
npm run dev        # http://localhost:5173/
npm run build      # static build in dist/
```

![Open field battle](docs/field.png)

| River crossing | Siege |
|---|---|
| ![River crossing](docs/river.png) | ![Siege](docs/siege.png) |

## URL parameters

| Param | Values |
|---|---|
| `stage` | `field` `hills` `forest` `canyon` `bridge` `harbor` `siege` `marsh` `village` `ambush` `frozen` `flood` `firestorm` `landslide` `naval` `burnforest` |
| `weather` | `clear` `fog` `rain` `snow` `dusk` `night` |
| `mode` | `annihilate` (default) `capture` `reinforce` `escort` |
| `era` | era pack id for both armies (below); default `rome` |
| `era0` / `era1` | per-army pack override (dream matchup) |
| `scenario` | `nightraid` (Japan pack, siege) |
| `size` | `S` (~800) `M` (~2,000) `L` (~4,500) `XL` (~10,000) `XXL` (~20,000) |
| `cam` | `cine` (default) `free` `overview` |
| `seed` | number; same stage/size/mode/era/seed reproduces the same battle (determinism, below) |
| `diff` | `easy` `normal` (default) `hard` — enemy command only (reaction interval, reserve timing, aura strength), never unit stats; panel-less, URL only |
| `autostart` | seconds until the battle starts |

Removed values fall back, never silently to field: `stage=camp` → `siege`, `stage=ford` / `river` → `bridge`, `mode=retreat` → `annihilate`, `cam=follow` → `cine`.

## Stages (16)

| Stage | Notes |
|---|---|
| field 平原 | Pitched battle; engineers plant stakes first. |
| hills 丘陵 | High ground hits harder, uphill is slow; missile troops start on the hills. |
| forest 森 | Every tree blocks movement and arrows; a few lanes funnel the armies. |
| canyon 峡谷 | Cliffs close to a narrow neck; formations deepen. |
| bridge 落橋 | Deep water, one wooden bridge the defenders demolish; two pontoon sites. |
| harbor 港 | Landing from transports and ferry boats against a defended port town. |
| siege 攻城 | Walled city: ram vs gate, ladders, onagers; reserves fight at the breach. |
| marsh 沼地 | Mud slows by weight: engines and elephants crawl, light foot barely notices. |
| village 村落 | Houses and fences around a square (the capture point in `capture`). |
| ambush 峠の伏撃 | A marching column in the canyon, ambushers on both slopes. |
| frozen 凍河 | Ice halves cavalry turn rate, slides everything, cracks under elephants and engines. |
| flood 決壊洪水 | Dam breaks mid-battle (warning 30 s prior); water rises 0.8 m, regiments evacuate to the banks. |
| firestorm 燃える都 | Siege with fires breaking out among the houses (~every 50 s). |
| landslide 崩れる峠 | Earthquake drops a rockfall across the pass; engineers can clear it. |
| naval 海戦 | Harbour landing plus two galleys that berth and loose their marines. |
| burnforest 火攻めの森 | Forest whose trees burn and stop blocking once burnt out. |

Weather effects: fog/night shorten sight, rain/snow slow the march and spoil aim, dusk is looks only.

Victory modes: `annihilate`; `capture` (hold the flag); `reinforce` (fresh regiments arrive mid-battle); `escort` （輜重護衛， open-ground stages — at least half the wagons must exit the far side before the 600 s limit; the limit is the measured break-even of route length vs convoy pace under fire).

The world is a height field plus a raster of man-made floors (walls are plateaus, ladders steep ramps, bridges causeways). Pathfinding is A* on a 2 m grid with connected-component checks; regiments narrow into columns in tight passages.

## Era packs (15)

`src/eras/` — a pack swaps factions, unit/weapon tables, deployments, stage reskins and the BGM track. China and Europe are three eras each, every era reusing the previous one plus its difference. Firearms stop at matchlock level.

| Pack | id | Contents |
|---|---|---|
| 古代ローマ | `rome` | The default game: Legion vs Eastern Kingdom. Identity pack — the snapshot baseline is this battle. |
| ギリシャ vs ペルシャ | `greece` | Phalanx (front-strong/flank-weak arc rule), Spartans, peltasts; Persia: spear masses + Immortal bowmen. Scenario: テルモピュライ (canyon, Persian waves). |
| カルタゴ | `carthage` | 8 war elephants a side, Numidian javelin horse, camels; desert reskin; Cannae flank-swing hook. |
| 日本・戦国 | `japan` | 足軽槍， 侍， 弓， 鉄砲 (long range, rank rotation, gunshot morale shock), 薙刀， 騎馬侍. Castle siege reskin （天守）, 夜襲 scenario. BGM: 都節音階. |
| 中国 CN1 戦国〜漢 | `china-early` | Chariots as the star arm, 戟/戈， massed crossbow, heavy infantry; 函谷関 = canyon. |
| 中国 CN2 三国〜唐 | `china-mid` | + 連弩， 火矢 (igniting arrows), heavy cavalry. 火船・赤壁： fire ships on the naval stage. |
| 中国 CN3 宋〜元明 | `china-late` | + 火槍， 火砲， 火箭， 回回砲 (counterweight trebuchet). The Song-vs-Mongol era; Ming relief in the Imjin preset. |
| 欧州 EU1 中世前期 | `europe-early` | Vikings folded in: shield wall, berserkers, huscarls, Norman proto-knights; landing raid (harbor), Hastings-style hills. |
| 欧州 EU2 中世盛期 | `europe-mid` | Knights with couched-lance first-charge (×2.2, 20 s re-couch), squires, trebuchets, siege towers, stone-castle siege. |
| 欧州 EU3 中世後期 | `europe-late` | Longbows (range 215), handgonnes, Swiss pike, early cannon; 泥の弓戦 (marsh: defender longbows behind wet ground). |
| モンゴル | `mongol` | Horse archers with feigned-retreat kiting (melee pursuers only), lancers, heavy cavalry, borrowed onagers. 元寇・神風： vs Japan on harbor/naval, a typhoon at 420 s. |
| 朝鮮 | `korea` | Bow-centric army, 勝字銃筒， 火車， 義兵 militia; 亀甲船 = naval-defence hook (shore battery + cannonade). Imjin presets: vs `japan`, Ming relief = `china-late`. |
| オスマン vs ビザンツ | `ottoman` | Janissary guns, Sipahi, giant bombard (range 380); Greek fire (26 m igniting projector). コンスタンティノープル = siege at full stretch. |
| インド | `india` | 10 war elephants a side (temperament-driven panic chains), chariots, Rajputs; monsoon hook at 300 s. |
| コンキスタドール vs アステカ | `aztec` | Few steel elites + arquebus + cavalry + dogs vs macuahuitl mass (high damage, ×0.45 vs armour) with fanatical morale; unknown-weapon shock ×2.2 against the Aztec side; lake city = harbor. |

BGM: one track per pack (pentatonic ×3 for China, Dorian ×3 for Europe, miyako-bushi for Japan, raga phrases for India, …) over the five family tracks (field/river/harbor/siege/forest).

## Units and weapons (base pack)

- Infantry: sword, axe (breaks shields), mace (knocks down), spear, pike (anti-cavalry, weak inside its reach), javelins (3 throws), sling, bow, crossbow, engineers (stakes, ladders, pontoons, demolition, ignite, rubble clearing)
- Mounted/animals: cavalry, cataphracts, horse archers (circle and shoot), camels (horses fear them), war elephants (can panic), scythed chariots, war dogs
- Engines: battering ram, onager

## Individual soldiers

Every soldier is generated, not cloned:

- Stats: build, strength, speed, vitality, defence, courage; unit quality shifts the averages. HP, stamina and morale change during battle.
- One trait each （勇敢/臆病/狂戦士的/老練/忠実/なし）: shifts flee thresholds and rallying; veterans emit a small morale aura; the loyal hold near a living standard.
- Buddies: adjacent pairs in foot regiments; a buddy's death triggers rage-charge or collapse, weighted by trait, and enters the results timeline.
- Looks: regiment shield emblems, hair/beard variants, crest sizes, shoulder/belly variation, ~10% left-handed (pose mirrored, hit tests untouched), nicknames (some drive the look: 隻眼 → eyepatch). Armour darkens in grime/blood steps as HP falls; the wounded limp (asymmetric gait), the heavily wounded may drop their weapon.
- Attack style per man: overhead / thrust / shield-bash ratios.
- Animals: per-animal temperament (calm / nervous / bold) drives elephant panic, horse camel/fire fear and flight; horses get coat markings (socks, blaze, spots), elephants tusk/size variation, some dogs fight on after their handler dies; idle animals graze and paw the ground.

## Chain of command

General → wing commanders → captains / standard bearers. Commanders support nearby morale; a fallen general slows his army's AI and collapses morale; fallen standards are picked up again; orders to regiments whose superiors are dead arrive late by messenger （伝令中）. The AI is hierarchical on both sides (reserve timing at general level, target sharing inside wings, cavalry swings wide). Own-side AI is always on; a regiment you order by hand leaves the AI (`manual`) until you hand it back.

## Controls

| Input | Action |
|---|---|
| WASD / arrows, Q/E, R/F, wheel | Pan, rotate, tilt, zoom |
| Middle drag / Alt + left drag | Orbit |
| Left click / drag | Select regiments (Shift adds); click a soldier for their card (stats, trait, buddy) |
| Right click | Move; on an enemy: attack; right drag sets facing |
| Right click, engineers selected | River → pontoon, bridge → demolish, wall → ladder, ground → stakes |
| H / V / C / X / B | Hold / advance / charge / fire / fall back |
| Enter / Space / Z | Start / pause / slow motion |
| 1 / 3 / 4, T | Camera free / cinematic / overview; T tracks a soldier (the rig's internal follow mode — no longer a menu camera) |
| M | BGM on/off |
| Minimap click / drag | Jump the free camera there |
| Touch | 1-finger drag pans, pinch zooms/twists, tap selects |

HUD panels (status, controls, army tree, selection, soldier card, minimap, perf HUD, help) each close with a × button and reopen from the slim launcher on the left edge; state persists in localStorage. Help starts minimized; on narrow/portrait screens the tree starts closed. Engineer task buttons auto-collapse while the camera is cinematic/overview. A perf overlay （性能表示） shows FPS, step/draw time and the adaptive quality level (Q0–Q3). The results panel shows outcome, per-army losses, 殊勲者， per-regiment survivors, a timeline (including buddy events), and rematch / share-URL buttons.

## Background music

Procedural (no assets). `src/music.js` is the engine; `src/tracks.js` holds the data: five family tracks + one per era pack, all rooted on D. Intensity is continuous — a level eased toward how much of the armies is engaged thickens drums/bass/lead; stingers throw the song into its climax (gate broken, reinforcements) or its bridge (a general falls); win/lose jingles close the battle. The seed picks the track variation.

## Scale and performance

- Sizes S (~800) to XXL (~20,000). Over 6,000 bodies the simulation steps at 30 Hz.
- Three render LODs; distant soldiers re-pose less often; settled corpses move to a static buffer. Adaptive quality steps pixel ratio and pose skip down (Q0→Q3) when FPS sags.
- Sim cost per step in Node: ~2–4 ms (M), ~15 ms (XL), ~30 ms (XXL, experimental).

## How the motion works

- Procedural animation (`src/anim/human.js`): 18-joint skeleton, stride follows real speed (no foot sliding), two-bone IK, keyframed attacks/blocks/throws/climbing/swimming.
- Ragdolls (`src/sim/ragdoll.js`): the same joints switch to PBD physics on death/knockdown; survivors blend into a get-up.
- Quadrupeds (`src/anim/quadruped.js`): one parametric rig (horse/camel/dog) with walk–gallop blending, plus an elephant rig.
- Impacts (`src/sim/world.js`): capsule collision, momentum by mass ratio and closing speed; braced spears can impale charging horses.

## Determinism

Same stage/size/mode/era/seed → identical battle, guaranteed and tested. All simulation randomness runs through the seeded PRNG in `src/util.js`; `Math.random()` survives only as `cosmeticRand` in render/audio paths that cannot feed back (camera shake, colour jitter). Agent ids are world-local, so repeated battles inside one process also match and tool sweeps are order-independent. `npm test` pins the field/S/seed-7 snapshot against `tools/baseline.json` (±3).

## Fire and smoke

Fire (`src/sim/fire.js`) ignites, spreads and burns out per prop/tree. Smoke is **positional**: every 0.5 s the fire system stamps burning items into a 12 m grid, and a looker's sight range is scaled by the worst smoke cell at his position (×0.40 inside the smoke, ×1.0 clear of it) — there is no global sight factor.

## Code layout

```
src/
  main.js             boot, UI (tree, soldier card, orders, results, panels), main loop
  camera.js           free / cinematic / overview rig (+ internal follow for T)
  terrain.js          height API, terrain / water / scenery meshes
  scenario.js         deployments and chain of command per stage
  eras/               era packs: index.js (registry, composeEra), per-pack files, deploy.js helpers
  sound.js            procedural WebAudio SFX        music.js / tracks.js  BGM engine / data
  weather.js          sky, fog, light, precipitation and their battle effects
  minimap.js          minimap canvas and click-to-jump
  anim/               human.js (18-joint procedural), quadruped.js (horse/camel/dog, elephant)
  sim/                stage, nav (A*), agent, world, combat, ai, objective, command,
                      engineering, landing, projectiles, ragdoll, stageEvents,
                      fire (ignition/spread/smoke grid), dynamics (flood, ice, galleys, fires)
  render/             instanced bodies, stage structures, particles
tools/                bench / balance (win-rate sweeps incl. escort), test (deterministic snapshot),
                      ui-check (browser: layout at 1280x720 + 390x844, adaptive quality, touch, panels)
```

## Testing

```
npm test                    # deterministic snapshot vs tools/baseline.json (±3)
node tools/test.mjs --update   # regenerate the baseline after an INTENTIONAL sim change (say so in the commit)
node tools/balance.mjs field,canyon 1,7,42 S 600 escort   # win-rate sweep (stages, seeds, size, seconds, mode)
node tools/bench.mjs siege S 45                            # one-stage smoke with per-regiment end states
node tools/ui-check.mjs     # browser UI verification; own vite server on :5199
node tools/facing-probe.mjs # facing audit: post-pose joint geometry vs heading for every unit type (all packs)
```

## Approximations

Deliberate, documented in the code where they live:

- Burnt houses keep their mesh (the stage renderer is static); only the raster block collapses.
- Naval galleys berth and land marines over a gangplank; no ship-to-ship grappling. Turtle ships are an effect (shore battery + cannonade), not a hull prop.
- The flood resamples navigation in fine steps (0.05 of the rise) instead of flowing continuously; evacuation to final-level high ground is continuous (0.5 s scan).
- Era packs: siege towers task like rams (no wall bridging); the giant bombard's calibre is range/size on standard rock mechanics; Greek fire cannot be quenched is not modelled (normal ignition); the Immortals' spear half, hwacha rockets (rock arc), Aztec capture-warfare (fanatical morale) and uibyeong terrain stubbornness (numbers) are approximated; the Genko typhoon degrades all missile fire and drowns embarked marines but hulls do not visibly sink; longship/dragon-prow and castle reskins are dressing keys, geometry is shared.
- Cross-era dream matchups are not balance-tuned (elephants rout low-discipline gun lines; gunpowder counters pure cavalry).

## License

MIT — see [LICENSE](LICENSE).
