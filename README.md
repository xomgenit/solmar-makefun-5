# SOLMAR — Streets of the Sun

An original 2D top-down open-world crime game, built for make.fun's
**Make GTA 6** bounty (gta6-01). Danny "Dice" Marlow is back in Solmar Bay:
steal cars, lose the heat, take jobs from fixer Vera Santos, and make the
city yours. Fully offline — no network requests, no external assets, all
sound synthesised in the browser.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Controls

- **WASD** move / drive · **Shift** sprint · **Space** handbrake
- **E** steal car / exit / respray / heal
- **Mouse** aim · **Click / hold** shoot
- **Esc / P** pause (save, stats, restart mission)

## What's in the game

- A seeded procedural city: named landmarks (hideout, diner, docks, pier,
  bank, garage, auto spa, hospital, SBPD HQ), zones, beach and sea
- Walk/sprint + arcade driving (5 car models + police cruiser), traffic and
  pedestrians, car stealing
- Wanted 0–5: foot cops who chase and shoot, cruiser pursuit with ramming,
  heat that cools when unseen, respray at Sunset Auto Spa
- Mouse-aim combat, health, wasted/busted screens
- Missions and a story, HUD with round minimap, title + pause menus,
  localStorage save (the city seed is saved, so CONTINUE rebuilds the
  same city)

## Layout

- `game/` — the playable game as static files (`index.html` + ES modules)
- `main.ts` — the entry program: copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `screenshots/` — screenshots of the game itself

## License

MIT — see [LICENSE](LICENSE).
