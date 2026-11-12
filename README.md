# quiet-nook

A cozy desktop study companion with two rooms: a floor-seated afternoon scene and the original desk room. A pomodoro timer appears as an alarm clock.

![quiet-nook](docs/hero.jpg)

![Four scenes: rainy night, afternoon, dusk, snowy night](docs/scenes.jpg)

## Features

- The floor room has one afternoon scene and two static poses, 托腮 and 轻搭. Its character and room are separate images.
- The desk room has afternoon, dusk, rainy night and snowy night scenes, plus the original 居家, 睡前 and 成熟 looks. The desk character breathes, blinks and changes expression.
- A pomodoro timer appears on the floor or desk. Click the clock to start or pause. It beeps when a phase ends.
- Stickers on the desk room's laptop lid, baked into each scene image with the lid's perspective and lighting.
- The whole room, including the clock and her speech bubble, is canvas. The side panel is the only DOM element over it.
- She can operate the clock: say "I'm going to focus for a while" and she starts it.
- Chat with her. She sees the timer state and your to-do list, and stays quiet while you focus.
- Synthesized rain and brown noise, no audio files.
- Everything is stored in the browser (`localStorage`). There is no account and no server-side state.

## Quick start

Requires Node 20 or newer and a browser with WebGL.

```sh
export ANTHROPIC_API_KEY=...   # or see the backend table below
npm start                      # http://127.0.0.1:7777
```

`./run.sh` starts the server and opens it as a standalone app window with Chromium or Chrome (`--app`).

Controls: use the room, scene and pose buttons at the top of the panel. Click the clock to start or pause. Keys `1`, `2` and `3` cycle expressions, scenes and poses respectively. The floor poses do not yet have expression assets.

## Chat backends

The server keeps your key out of the browser. It picks a backend from the environment, or from `CP_BACKEND`.

| Backend | Selected when | Settings |
|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` is set | `CP_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_BASE_URL` |
| `openai` | `OPENAI_API_KEY` is set | `CP_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL` for any OpenAI-compatible endpoint |
| `opencode` | neither key is set | a running local [opencode](https://opencode.ai) service; `OPENCODE_URL` (its port changes on restart), `CP_MODEL`, `CP_PROVIDER` |

The server listens on `127.0.0.1` only. Set `HOST=0.0.0.0` only if you understand that anyone who can reach the port can spend your API quota.

## How it works

```
public/
  art/                       the floor room and its two transparent character sprites
  scene/<scene>/plate.webp   the empty room, with the chair and the desk behind where she sits
  looks/<look>/              desk-room looks shared by its four scenes: neutral.webp is
                             the whole transparent cut-out of her, the other faces are small patches of just the
                             face (faces.json has their rectangles) that char.js lays over it
  props/                     one alarm clock sprite per scene, and clock.json (corners of its glass)
  char.js                    WebGL: room plate and character; a 2D canvas draws weather, clocks and speech
  app.js                 timer, to-do list, sound, chat, side panel
server.js, backends.js   static server and the chat proxy
tools/                   scripts used to build the art, see below
```

She answers in a fixed format: an expression tag (`[neutral]`, `[happy]`, `[shy]`, `[sleepy]`, `[think]`, `[cheer]`), the text, and optionally an action tag (`[start]`, `[break]`, `[pause]`, `[reset]`) that the page executes on the clock. The system prompt is in `public/app.js`.

## Art pipeline

The images were generated with an AI image model (`gpt-image-2`) and are not hand drawn. The scripts in `tools/` describe the older desk-room pipeline and were written for the author's machine, so expect to edit paths:

- `gen.py`: one image edit or generation through a local opencode service.
- `build.py`: bakes the laptop stickers into each generated empty room and writes `public/scene/<scene>/plate.webp`. The laptop corners are measured by hand for each room. The stickers come from one generated sticker sheet.
- `makelook.py` makes a look: `uv run tools/makelook.py step|pick|faces|build|status <look>`. She is generated with a real alpha channel (`background: transparent` in the image request). `step` and `pick` produce the neutral picture in a few steps with candidates you choose from, `faces` makes the six faces from it (a refused request is retried, never reworded), and `build` writes `public/looks/<look>/` and its entry in `public/looks/looks.json`, then checks the result. The prompts and the rules the model needed (no furniture, keep the eyes, mouth style, no teeth in a yawn, sleeve edge) are in `tools/looks/common.json`, and each look has `tools/looks/<look>.json`. Sources go in `art-src/looks/<look>/`.
- To add a look: write `tools/looks/<id>.json` (copy `rose.json`), then `step`, `pick` for each step, `faces`, `build`. The page picks it up from `looks.json`; `"when": "break"` makes it the look worn during a break.
- `trbuild.py`: used by `makelook.py build`. It aligns every face to neutral and computes one face region per look, cut along the face and including the brow band, so that a seam never crosses a brow, lid, lip or the edge of the hair. `check` fails the build if feature changes lie outside that region or the silhouette grows.
- `keygs.py`, `score.py`, `pick.py`: the older green-screen route, no longer used for her. `keygs.py` solves alpha and colour from the screen colour; it left light and dark fringes on thin hair that flickered when she moved.
- `clockbuild.py`: keys the clock sprites and measures the corners of each clock's display.
- `cdp_t.mjs`: drives a Chrome DevTools Protocol endpoint for screenshots.

The source images are not in the repository because they are about 75 MB.

## Limits

- The `anthropic` and `openai` backends have been exercised only with a dummy key (the request reaches the provider and is rejected). The `opencode` backend is the one used day to day.
- The animation is a few pixels of displacement of a painted image, not a rigged model. It reads as alive, not as a game character.
- On a very wide, short window the scene is cropped to fill it, so you see her face and part of the desk.
- She is a companion character, not a therapist. The prompt tells her to point you to people around you or a local helpline if you mention self-harm, and not to give a diagnosis. Do not rely on it for crisis support.

## License

MIT for the code, see `LICENSE`. The images in `public/scene` and `public/props` are AI generated and are not covered by the MIT license.
