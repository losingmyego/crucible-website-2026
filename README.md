# Crucible website (2026)

The start of the new Crucible website. It began as the "sand-scroll" prototype in the brand kit repository (`losingmyego/crucible-brand-kit`, `surfaces/prototypes/sand-scroll`) and was moved here on 2026-11-16.

Work in progress. Colours, the sans text face and the placeholder header labels are working picks, not brand decisions.

## Run it

Needs Node 20 or newer.

```
npm install
npm run dev
```

Then open http://localhost:3000.

## Pages

| Address | What it is |
| --- | --- |
| `/` | The homepage: the cathedral hero. A drawn cathedral, the gothic window with the symbol as its tracery, light rays, and text that turns to dust and rises into the window. |
| `/topography` | The topography page: contour lines of Spruce Pine with the text in a clearing. Carried over as it was; where it sits on the site is not decided. |
| `/topography-2` | The same page with its scroll effects. |
| `/tool` | The window tool. Sets how the window, the cathedral and the light are drawn. The homepage reads whatever is set here. |

## Settings

Every page has a settings panel for working on it. It is hidden until you press the small "settings" button at the bottom left (the window tool always shows its panel). Settings are remembered in the browser, and "copy share link" gives a link that carries them to another browser.

A browser that has never opened the site sees the defaults, which are Neesh's settings as of 2026-11-16:

- window, cathedral and light: `GLASS_LOOK` in `app/glass/look.ts`
- text, scrim and opening length: `LOOK` in `app/cathedral/CathedralPage.tsx`
- dust: `DEFAULTS` in `app/SandText.tsx`
- colours for each theme: `BASE_COLORS` in `app/SandText.tsx`

To make new settings the default for everyone, put the new values in those four places.

## Where things are

- `app/text.ts`: the homepage text (`HOME`) and filler for the topography pages.
- `app/cathedral/CathedralPage.tsx`: the homepage, its backdrop and the opening.
- `app/SandText.tsx`: the text column and the dust.
- `app/glass/`: the window (`engine.ts`, `useWindow.ts`), the drawn cathedral (`nave.ts`), the etched cathedral (`Etched.tsx`, an engraving of `public/cathedral/church-tone.jpg`; pick it in the tool under "which cathedral"), the light rays (`Rays.tsx`) and the tool (`GlassTool.tsx`).
- `app/topo/TopoPage.tsx`: the topography page.
- `app/lab.tsx`: themes, remembered settings, smooth scrolling and the panel.
- `public/windows/`: window drawings as SVG. `public/topo/`: the height map.

## What was left behind in the move

Removed because the site does not use them: the funnel, disperse and photo-window pages; the original cathedral picture (a 2.4 MB image) and the option to use it; the old shafts-of-light layer behind the dust; the disperse behaviour of the dust; the lockup above the homepage text; and the code that read settings saved by earlier versions of the prototype.
