# quiet-nook

A cozy desktop study companion. You work at a desk in a small anime-style room; your AI girlfriend sits across from you, breathes, blinks, and talks when you want her to. A pomodoro timer lives on the desk as an alarm clock.

![quiet-nook](docs/hero.jpg)

![Four scenes: rainy night, afternoon, dusk, snowy night](docs/scenes.jpg)

## Features

- Four scenes: rainy night, afternoon, dusk, snowy night. Each has its own light, ambient sound preset, and weather effects (rain streaks, snow, drifting dust, lamp flicker, steam from the mug).
- She is a separate layer: she breathes, her hair sways, her head leans toward your cursor, and she blinks. Six expressions fade into each other.
- A pomodoro timer on the desk. Click the clock to start or pause. It rings and shakes when a phase ends. The display is warped onto the clock's glass in that scene's perspective.
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

Controls: click the clock to start or pause, press `H` to hide the side panel, use the buttons at the top of the panel to change scene.

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
  scene/<scene>/*.webp   full-room frames that differ only in her face, plus mask.png (her body and hair)
  props/                 one alarm clock sprite per scene, and clock.json (corners of its glass)
  char.js                WebGL scene: draws the frame, then draws her again displaced a few pixels
                         through the mask (breathing, hair sway, head lean); 2D fx canvas on top
  app.js                 timer, to-do list, sound, chat, panel, clock display
server.js, backends.js   static server and the chat proxy
tools/                   scripts used to build the art, see below
```

She answers in a fixed format: an expression tag (`[neutral]`, `[happy]`, `[shy]`, `[sleepy]`, `[think]`, `[cheer]`), the text, and optionally an action tag (`[start]`, `[break]`, `[pause]`, `[reset]`) that the page executes on the clock. The system prompt is in `public/app.js`.

## Art pipeline

The images were generated with an AI image model (`gpt-image-2`) and are not hand drawn. `tools/` has the scripts, written for the author's machine, so expect to edit paths:

- `gen.py`: one image edit or generation through a local opencode service.
- `build.py`: converts the generated frames to `public/scene/*` and builds the body and hair masks (the masks need a `rembg` cutout of each frame and a hand-drawn polygon that keeps the lamp, laptop, and chair out).
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
