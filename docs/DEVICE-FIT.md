# Device-fit audit

An audit of how Coach Clawde adapts to the device it runs on. It covers safe
areas, viewport sizes, orientation, the on-screen keyboard, hardcoded offsets,
corner-radius nesting, the iOS text-size setting and light/dark mode. It does
**not** cover visual style. No code has been changed. Each finding has a
proposed fix, and the fixes are grouped into phases at the end.

Audited on branch `claude/open-claude-app-and-prompt-refinements` (`bb3d7c6`), 2026-09-30.

> **Status (2026-10-01): all findings addressed** except the optional light
> theme (D-1 step 2). Two passes:
>
> 1. *Layout tokens* (`3143f2a`): safe-area and tab-bar tokens, floating
>    concentric tab bar, iPad/landscape sidebar, token-based bottom padding.
> 2. *Follow-up*, in five groups:
>    - **Sheets + keyboard:** every sheet uses the shared `BottomSheet`. It
>      rides above the keyboard via `--kb` (`useKeyboardInset`), uses `dvh`,
>      is shell-width and has 44 px close targets. The chat-onboarding composer
>      also docks to the keyboard. (K-1, S-4, S-5, W-2)
>    - **Typing:** all fields are 16 px, the zoom lock is removed,
>      `interactive-widget=resizes-content` is set, and Session fields use
>      Enter-to-advance with `enterKeyHint`. (K-2, K-3, V-1)
>    - **Safe areas:** status-bar backing strip, rest timer centred on short
>      screens, flight landing tracks Home's mascot (including with the
>      sidebar), Login is safe-area padded. (S-1, S-6, S-7, S-8)
>    - **Text size:** iOS Dynamic Type opt-in (`lib/dynamicType.ts`, clamped
>      14–24 px root), a `text-2xs` token replaces every 9/10 px size, set and
>      interval rows reflow via container queries, Plan chips wrap, and key
>      icons are em-sized. (T-1, T-2, T-3, H-2, H-3)
>    - **Tablet, orientation, radii, colour:** the manifest orientation lock is
>      removed, iPad detection is fixed, `rounded-nested` gives concentric
>      corners (tile → set row → controls, routine card, confirm dialog),
>      two-column lists on iPad, a wider column on large iPads, and
>      `color-scheme: dark`. (O-1, O-2, R-1, W-1, D-1 step 1)
>
> **Installed-app follow-up:** on a real iPhone home-screen app the tab bar
> floated about 59pt (the status bar's height) above the bottom. iOS reports a
> viewport shorter than the screen there. Screen-anchored UI now lives in
> `#fixed-layer` (`FixedLayer.tsx`), which `lib/deviceShape.ts` sizes from the
> real screen height in the installed iPhone app. The tab bar uses the
> display's corner radius (looked up by screen size) to sit concentric with
> the bezel. Settings → About shows a "Display:" line with the measured
> numbers for debugging on devices.
>
> **Correction to K-2:** iOS does show a Done key, in the form accessory bar
> above the keypad. The real gaps were Android's enter key doing nothing and
> the focused row scrolling out of view; both are now handled.
>
> K-5 (onboarding prompt step) no longer applies: v1.0.1 replaced that step
> with the chat flow. Everything was verified in the browser pane with
> simulated insets, keyboard and text size. A real iPhone and iPad are still
> needed to confirm `env()` insets, keyboard panning and Dynamic Type.

## How this was tested

- **Build:** `npm run dev` in local mode (Supabase env blanked, so there is no
  login) with a seeded profile: a current-week plan with a weights session, a
  cardio session and a missed session, a previous week, and one logged session.
- **Viewports (browser pane):**

  | Label | CSS px | Simulated safe-area insets (T / R / B / L) |
  |---|---|---|
  | Small phone (SE) | 375 × 667 | 20 / 0 / 0 / 0 |
  | 375 phone portrait (mini / X / 11 Pro) | 375 × 812 | 59 / 0 / 34 / 0 |
  | 430 phone portrait (Pro Max / Plus) | 430 × 932 | 59 / 0 / 34 / 0 |
  | Phone landscape | 812 × 375 | 0 / 47 / 21 / 47 |
  | iPad portrait | 820 × 1180 | 24 / 0 / 20 / 0 |
  | iPad landscape | 1180 × 820 | 24 / 0 / 20 / 0 |

- **Safe areas:** a desktop browser always reports `env(safe-area-inset-*) = 0`.
  To get round that, a test script re-resolved the app's `.pt-safe` and
  `.pb-safe` utilities with the device values above, as `env()` would on an
  iPhone, and drew the unsafe zones as red bands. Anything that sits in a red
  band on a screenshot would be under the status bar, Dynamic Island, notch or
  home indicator on a real device.
- **Keyboard:** simulated as a 336–346 px panel pinned to the bottom (the iOS
  keyboard plus its accessory bar), with the relevant field focused. iOS Safari
  and standalone PWAs **don't** resize the layout viewport for the keyboard, so
  `position: fixed; bottom: 0` content and bottom-anchored sheets end up behind
  it.
- **Text size:** simulated by raising the root font size to 22 px (about the
  "Larger Text" accessibility sizes). See T-1 for why the real setting currently
  has no effect.
- **Not rendered:** `Login`, which redirects away in local mode. It was
  reviewed from source only. Real-device checks are still needed; see
  *Verification* at the end.

## Summary matrix

✅ fine · ⚠️ works but fragile or off-spec · ❌ broken or clipped · — not applicable

| Screen / overlay | Top safe area | Bottom safe area | Landscape L/R | Keyboard | iPad | Large text |
|---|---|---|---|---|---|---|
| Home | ❌ S-1 (scrolls under status bar) | ❌ S-2 (last card under nav) | ✅ | — | ⚠️ W-1 | ⚠️ T-3 |
| History | ✅ | ✅ | ✅ | — | ⚠️ W-1 | ⚠️ T-2 |
| Progress / Best efforts | ✅ | ✅ | ✅ | — | ⚠️ W-1 | ❌ T-2 (10 px) |
| Program | ✅ | ✅ | ✅ | — | ⚠️ W-1 | ❌ T-2 (9 px) |
| Program setup + Sports sheet | ✅ | ❌ S-4 | ❌ S-5 | — | ❌ W-2 | ⚠️ |
| Settings | ✅ | ❌ S-2 | ✅ | ⚠️ K-3 | ⚠️ W-1 | ⚠️ T-2 |
| Plan your week | ✅ | ⚠️ S-3 | ✅ | ⚠️ K-3 | ⚠️ W-1 | ❌ T-3 (horizontal clip) |
| ↳ Prompt sheet | ✅ | ❌ S-4 | ❌ S-5 | — | ❌ W-2 | ⚠️ |
| ↳ Import sheet | ✅ | ❌ S-4 | ❌ S-5 | ❌ K-1 | ❌ W-2 | ⚠️ |
| ↳ "Plan next week?" dialog | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Session (live) | ✅ | ✅ | ❌ S-5 | ⚠️ K-2 | ❌ W-2 | ❌ T-3 (set row breaks) |
| ↳ Rest timer | — | ⚠️ S-6 | ❌ S-6 (top clipped) | — | ✅ | ⚠️ |
| ↳ Complete / week-reflection sheet | ✅ | ❌ S-4 | ❌ S-5 | ❌ K-1 | ❌ W-2 | ⚠️ |
| Onboarding (all steps) | ✅ | ✅ | ✅ | ⚠️ K-4 | ⚠️ W-1 | ⚠️ |
| ↳ Prompt step | ✅ | ❌ K-5 (CTA below fold) | ❌ K-5 | — | ⚠️ | ⚠️ |
| ↳ Flight-to-home | ❌ S-7 | — | ✅ | — | ✅ | — |
| Login (source review) | ⚠️ S-8 | ⚠️ S-8 | ✅ | ⚠️ K-3 | ⚠️ W-1 | ❌ T-2 |
| Loading / auth splash | ✅ | ✅ | ✅ | — | ✅ | — |

App-wide findings that don't belong to one screen: **V-1** (viewport meta),
**T-1** (text size is ignored), **D-1** (light/dark), **R-1** (radii),
**O-1** (orientation).

---

## Findings

### Safe areas

#### S-1 — Home content scrolls under the status bar / Dynamic Island ❌
`src/pages/Home.tsx:50`. Home is the only tab without a sticky `PageHeader`.
The top bar gets `pt-safe`, but it scrolls away with the page. Because the app
uses `apple-mobile-web-app-status-bar-style: black-translucent`
(`index.html:9`), the mascot and the Today card then slide straight under the
status-bar clock and the Dynamic Island with nothing behind them (seen at
375 × 812 after a short scroll).

**Fix:** add a fixed status-bar scrim. This is a
`fixed top-0 inset-x-0 h-[env(safe-area-inset-top)] bg-[#0a0a0a]/95 backdrop-blur z-40`
strip, rendered once in `App.tsx` so it covers every route. The alternative is
to make Home's top bar sticky like `PageHeader`. The scrim is the simpler fix
and also covers any future header-less screens.

#### S-2 — Hardcoded `pb-24` is shorter than the bottom nav on notched phones ❌
The nav is `py-3` + a 22 px icon + a label + `pb-safe`, which comes to **~100 px
on a home-indicator iPhone** (measured 99.8 px) and ~81 px without one.
`pb-24` is 96 px. Measured at 375 × 812:
- **Home** (`Home.tsx:48`): the "Week 2 of 12 · 0/4 sessions" pill ends 18 px
  under the nav at full scroll.
- **Settings** (`Settings.tsx:43`): the "Redo onboarding" card's text ends 3 px
  under the nav, and the card's bottom edge is hidden.
- `History.tsx:31` (empty state) uses the same `pb-24`. It's centred, so it's
  only marginal today.

Pages using `pb-32` (128 px: Progress, History list, Program, Best efforts,
Session) fit, but only because they over-pad by ~28 px. That's the same
guesswork the other way round.

**Fix:** define the nav height once, e.g. `--nav-h: 4rem` in `index.css`.
Give the nav `height: calc(var(--nav-h) + env(safe-area-inset-bottom))`, and
add a `.pb-nav` utility of
`padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 1rem)`.
Better still, apply that padding once in `MainApp` (`App.tsx`) on a wrapper
around `<Routes>` whenever the nav is shown, and delete every per-page
`pb-24`/`pb-32`.

#### S-3 — Full-screen routes still carry nav padding ⚠️
`WeekPlanner.tsx:160` has `pb-24`, but `/plan` is in `FULLSCREEN_ROUTES`
(`BottomNav.tsx:11`), so there's no nav to clear. The page then ends with a
96 px dead zone and **no** home-indicator padding of its own. That works only
by accident.

**Fix:** once S-2's wrapper owns nav padding, full-screen routes use
`pb-safe` plus normal spacing.

#### S-4 — Bottom sheets ignore the home indicator ❌
All four bottom sheets end in a fixed `pb-6` (24 px) with no `pb-safe`. With a
34 px home indicator, their last button sits partly in the gesture zone:
- Prompt sheet `WeekPlanner.tsx:337`: "Copy again" ends at 908 px on a 932 px
  screen, 10 px into the zone (430 × 932).
- Import sheet `WeekPlanner.tsx:379`: Cancel / Import Week, same geometry.
- Complete flow `CompleteFlow.tsx:68` / `:139`: "Save Session" ends at 788 px on
  812, 10 px into the zone (375 × 812).
- Sports sheet `ProgramEdit.tsx:275`: `pb-6` on the scroller.

**Fix:** build one shared `<BottomSheet>` in `components/shared/` (it would also
fix S-5, W-2 and K-1). Its footer gets
`padding-bottom: max(1.5rem, env(safe-area-inset-bottom) + 0.75rem)`.

#### S-5 — Fixed bars and sheets span the full viewport and run under the landscape notch ❌
The app shell is `max-w-md mx-auto` (448 px), but these `fixed` elements are
`inset-0` / `left-0 right-0` with no width cap and no side safe-area padding:
- Session "Complete Session" bar, `Session.tsx:385`: at 812 × 375 the button
  measured **776 px wide**, from x=16 to x=792, so both rounded ends sit inside
  the 47 px notch / sensor-housing zones.
- Complete flow sheet, `CompleteFlow.tsx:54`: 808 px wide in landscape. The
  title and the ✕ close button are under the notch zones.
- Prompt / Import sheets (`WeekPlanner.tsx:311,352`) and the Sports sheet
  (`ProgramEdit.tsx:266`) behave the same way.

The bottom nav is also full-bleed (`BottomNav.tsx:20`), but its tabs sit inside
a `max-w-md` row, so they stay clear. It's fine as it is.

**Fix:** give fixed bars an inner `max-w-md mx-auto` wrapper (as `BottomNav`
already does). Sheets become `w-full max-w-md mx-auto` (or `max-w-lg` on
tablets, see W-2). Add `.px-safe` =
`padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right))`
for anything that must stay full-bleed.

#### S-6 — Rest timer uses a magic `pb-10` and clips in landscape ⚠️/❌
`RestTimer.tsx:16`: `flex items-end … pb-10`.
- Portrait with a home indicator: `pb-10` (40 px) happens to clear the 34 px
  indicator, but only by 6 px, and not by design.
- Phone landscape (812 × 375): the card is ~340 px tall (`p-8`, a 128 px ring,
  labels, the Skip button), so with `pb-10` its **top edge and rounded corners
  are cut off** above the viewport (screenshot: the "REST" label touches the
  top edge).

**Fix:** centre it vertically in landscape or on short screens
(`items-center` below ~500 px height, via `@media (max-height: 500px)`).
Replace `pb-10` with `padding-bottom: calc(env(safe-area-inset-bottom) + 1.5rem)`.
Shrink `p-8` → `p-6` and the ring to `w-28` when height is short.

#### S-7 — Onboarding "flight to home" lands 64 px from the top regardless of the inset ❌
`Onboarding.tsx:734`: `top: landed ? '64px' : '42vh'`. On a Dynamic Island
phone, Home's mascot sits at ~59 px (inset) + 44 px (top bar) + 8 px, so it's
around 110 px down. The flight lands ~45 px too high, then Home renders the
mascot lower, which reads as a jump.

**Fix:** `top: landed ? 'calc(env(safe-area-inset-top) + 3.25rem)' : '42vh'`.
Better, measure the Home mascot's rect, but the calc is enough.

#### S-8 — Login has no safe-area padding (source review) ⚠️
`Login.tsx:102`: `min-h-svh justify-center px-6`, with no `pt-safe`/`pb-safe`.
Centring hides this on tall phones. On a short phone in landscape (375 px tall)
the mascot + form + footnote is taller than the viewport, so the top of the
column lands under the status bar and the footnote in the home-indicator zone.

**Fix:** add `pt-safe pb-safe` to the outer column and let it scroll
(`justify-center` → `my-auto` on the inner block, so it centres when it fits
and scrolls when it doesn't).

---

### Keyboard

#### K-1 — Sheets with text fields go behind the keyboard, and so do their action buttons ❌
iOS keeps the layout viewport at full height when the keyboard opens and pans
the visual viewport. A sheet anchored with `mt-auto` to the bottom of a
`fixed inset-0` container therefore stays under the keyboard:
- **Import sheet** (430 × 932, textarea focused): the textarea (top at 1017 px
  before the pan) and the Cancel / Import buttons are fully under a 346 px
  keyboard. The user has to dismiss the keyboard to press Import.
- **Complete flow** (375 × 812): with "Any pain or discomfort?" focused, the
  textarea spans 518–583 px and "Save Session" starts at 728 px, both below the
  keyboard's top edge at 476 px.

`max-h-[90svh]` makes it worse: `svh` doesn't shrink for the keyboard, so the
sheet can never get short enough to fit above it.

**Fix (in the shared `<BottomSheet>`):**
1. Add a small `useVisualViewport()` hook that writes
   `--kb: calc(100vh - visualViewport.height - visualViewport.offsetTop)` to
   `:root` on `visualViewport` `resize`/`scroll`.
2. Sheet: `bottom: var(--kb, 0)` and `max-height: calc(100dvh - var(--kb,0) - env(safe-area-inset-top) - 1rem)`.
   The body scrolls and the footer stays pinned.
3. Add `interactive-widget=resizes-content` to the viewport meta (V-1) so
   Android Chrome resizes the layout instead, where `dvh` then just works.

#### K-2 — Session number fields: no Done key, and no scroll-into-view above the fixed bar ⚠️
`SetRow.tsx:36–63`, `IntervalRow.tsx:95–122`. `inputMode="numeric"` on iOS
opens a keypad with **no return/Done key**. There's no `enterKeyHint` or Enter
handler, so the only way to close it is to tap elsewhere, which risks mis-taps
on the ✓ button. When the keyboard closes, the focused row can end up behind
the `Complete Session` bar, because nothing sets `scroll-padding-bottom`.

**Fix:** use `inputMode="decimal"` (it has a "." key, needed for weights, and
still no return key on iPhone), and add `enterKeyHint="next"`. On Enter, move
focus reps → weight → blur. Add `scroll-padding-bottom: calc(var(--action-bar-h) + var(--kb,0))`
on `html` while a session is active, or call
`el.scrollIntoView({ block: 'center' })` on focus.

#### K-3 — Inputs below 16 px, and zoom disabled to hide it ⚠️
These text fields use `text-sm` (14 px) or `text-xs` (12 px):

| Where | Size |
|---|---|
| `Login.tsx:193` (`inputClass`) | 14 px |
| `Settings.tsx:195` (`inputClass`) | 14 px |
| `Onboarding.tsx:323` (`TextInput`), `:486` injuries textarea | 14 px |
| `Onboarding.tsx:546` paste textarea | 12 px |
| `WeekPlanner.tsx:255` notes textarea | 14 px |
| `WeekPlanner.tsx:370` import textarea | 12 px |
| `CompleteFlow.tsx:100,112,167,179` textareas | 14 px |

iOS auto-zooms into any field under 16 px. The app suppresses that with
`maximum-scale=1.0, user-scalable=no` (`index.html:6`), which also **blocks
pinch-zoom** (an accessibility failure, WCAG 1.4.4) on Android and in iOS
standalone mode. Only the Session inputs already use `text-base`.

**Fix:** give every `input`/`textarea` at least `font-size: 1rem` (one rule in
`index.css`, or fold `text-base` into the shared input classes). Then drop
`maximum-scale` and `user-scalable` from the viewport meta (V-1).

#### K-4 — Onboarding footer and paste box when the keyboard is open ⚠️
The onboarding Next/Continue footer (`Onboarding.tsx:258`) sits at the bottom of
a `min-h-svh` column. With the keyboard open on Basics, Injuries or Paste, the
footer is under the keyboard. The user has to dismiss it to continue, which is
acceptable but not ideal. The paste textarea is `flex-1` (measured 356 px at
375 × 667), so on a small phone it fills the visible area above the keyboard.

**Fix:** set `enterKeyHint="next"` on single-line fields so the return key can
advance. Once `--kb` exists (K-1), lift the footer by it:
`padding-bottom: max(env(safe-area-inset-bottom), var(--kb))`. Cap the paste
textarea at `max-h-[40dvh]`.

#### K-5 — Onboarding prompt step: the "Open Claude" CTA is ~1,500 px below the fold ❌
`Onboarding.tsx:512` wraps the prompt in `flex-1 min-h-0 overflow-y-auto`,
which is meant to be a scroll box. Its ancestor is `min-h-svh`, not a fixed
height, though, so the box never gets a height limit. At 375 × 667 the page
measured **2,212 px tall**, with "Open Claude app" and Next at y≈2,176. On the
step whose whole point is that button, the athlete has to scroll past the full
prompt to find it.

**Fix:** make the onboarding root `h-dvh` (not `min-h-svh`) with
`overflow-hidden`, keeping the step body `flex-1 min-h-0`, so the prompt box
scrolls internally. Alternatively, cap the box at `max-h-[40dvh]`. Either way,
the CTA should be visible without scrolling at 375 × 667 and in landscape.

---

### Width, iPad and orientation

#### W-1 — iPad shows a 448 px phone column ⚠️
`App.tsx:23`: `max-w-md` everywhere. At 820 × 1180 and 1180 × 820 the app is a
narrow column with ~370 px / ~730 px of empty black on either side. Nothing
breaks, and it's consistent, but this is a product decision rather than a bug.

**Fix (recommended):** keep the single column but widen it at tablet sizes,
`max-w-md md:max-w-xl lg:max-w-2xl`. Let a few grids use the room:
- Home "This week" tiles `md:grid-cols-2`
- Progress stat tiles `md:grid-cols-4`
- Program history `md:grid-cols-2`

The Session screen should stay single-column at `max-w-xl` for thumb reach.
This needs S-5 done first, so fixed bars follow the shell width.

#### W-2 — Sheets on iPad are full-width slabs ❌
Same cause as S-5. On iPad portrait the Complete Session bar button is 788 px
wide under a 448 px column, and sheets span the whole 820/1180 px.

**Fix:** have `<BottomSheet>` become `max-w-lg mx-auto` from `md:` upward. On
landscape tablets (`lg:`), optionally show it as a centred card (`rounded-3xl`,
`my-auto`), as the "Plan next week?" dialog already does
(`WeekPlanner.tsx:391`, the one overlay that is already correct).

#### O-1 — Manifest locks portrait on Android only ⚠️
`vite.config.ts:67` sets `orientation: 'portrait'`. Installed Android PWAs
honour it; iOS/iPadOS ignore it, so iPhone landscape still happens (hence
S-5/S-6), and iPad users can rotate freely. The lock is inconsistent, and on
Android tablets it's actively unhelpful.

**Fix:** remove `orientation` (or use `any`) and make landscape correct via
S-5/S-6/K-5. Locking doesn't protect iOS, so the landscape layout has to work
anyway.

#### O-2 — Install step can't recognise iPads ⚠️
`Onboarding.tsx:615`: `/iphone|ipad|ipod/i.test(ua)`. iPadOS 13+ Safari reports
a Mac user agent, so iPad users get neither card highlighted and see the
desktop "look for the install icon" hint, which doesn't exist on iPad.

**Fix:** `isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)`.

#### V-1 — Viewport meta ⚠️
`index.html:6` has
`width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.

**Fix:**
`width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.
Keep `viewport-fit=cover`, since it's what makes `env()` non-zero. The zoom
lock comes out once K-3 is fixed.

---

### Hardcoded offsets and fixed pixel sizes

#### H-1 — Inventory of magic offsets
| Location | Value | Problem | Replace with |
|---|---|---|---|
| `Home.tsx:48`, `Settings.tsx:43`, `History.tsx:31` | `pb-24` | Shorter than the nav on notched phones (S-2) | Shell-level `pb-nav` |
| `WeekPlanner.tsx:160` | `pb-24` | Nav padding on a nav-less route (S-3) | `pb-safe` |
| `Progress.tsx:67`, `History.tsx:48`, `Program.tsx:38`, `BestEfforts.tsx:26`, `ProgramEdit.tsx:88` | `pb-32` | Over-pads by a guessed amount | Shell-level `pb-nav` |
| `Session.tsx:239` | `pb-32` | Guess at the action-bar height | `pb-[calc(var(--action-bar-h)+env(safe-area-inset-bottom))]` |
| `RestTimer.tsx:16` | `pb-10` | Accidental home-indicator clearance (S-6) | Safe-area calc |
| Sheets (4×) | `pb-6` | No home-indicator clearance (S-4) | `<BottomSheet>` footer |
| `WeekPlanner.tsx:311,352`, `CompleteFlow.tsx:54` | `max-h-[90svh]` | Doesn't shrink for the keyboard (K-1) | `dvh` + `--kb` |
| `ProgramEdit.tsx:266` | `max-h-[85svh]` | Same | Same |
| `Onboarding.tsx:734` | `top: '64px'` | Ignores the top inset (S-7) | `calc(env(safe-area-inset-top) + …)` |
| `index.css:29,33` | `.pb-safe` min 1 rem, `.pt-safe` min 0.5 rem | Fine, but there's no `px-safe`, and no nav/action-bar height tokens | Add `--nav-h`, `--action-bar-h`, `.px-safe` |

#### H-2 — Fixed pixel font sizes ❌
These don't scale with any text-size preference, and 9–10 px is below a
readable minimum on a phone:

| Location | Size | Content |
|---|---|---|
| `BottomNav.tsx:33` | 10 px | Tab labels |
| `SyncIndicator.tsx:15,24,33,42,50` | 10 px | Sync status (Progress header, Settings, Program setup) |
| `Progress.tsx:193,215,219` | 10 px | Heat-map weekday labels and legend |
| `Program.tsx:114` | **9 px** | Week-number labels under the bar chart |
| `WeekPlanner.tsx:299` | 10 px | "How it works" step numbers |
| `Onboarding.tsx:677,682` | 10 px | "You" tag, install-step numbers |
| `Settings.tsx:189` | 10 px | Field hint |
| `Login.tsx:185` | 10 px | Privacy footnote |

**Fix:** add a `--text-2xs: 0.6875rem` (11 px) token in the `@theme` block of
`index.css`, use `text-2xs` for these, and raise the 9 px chart labels to it.
Tailwind's `text-xs` is already rem-based and scales.

#### H-3 — Fixed-width boxes around text ❌ (appears under large text)
In `SetRow.tsx`: target column `w-16` (`:34`, `:119`), reps input `w-14`
(`:54`), timer buttons `h-8` (`:142`, `:150`). In `IntervalRow.tsx`: `w-20`
(`:121`, `:123`). These are rem-based, so they grow. The row, though, is a
single non-wrapping flex line in a fixed-width tile. See T-3.

---

### Text size (iOS Dynamic Type)

#### T-1 — The iOS text-size setting has no effect at all ❌
WebKit applies Dynamic Type only when a page opts in with the system font
keywords. `index.css:3–6` sets `font-family` only, and the root `font-size`
stays at the 16 px default. So neither Settings → Display → Text Size nor
Accessibility → Larger Text changes anything in the installed PWA. Safari's
per-site "aA" zoom does work in the browser, but it acts as page zoom.

**Fix:** opt in on `html`:
```css
html { font: -apple-system-body; }            /* picks up Dynamic Type on iOS */
@supports not (font: -apple-system-body) { html { font-size: 100%; } }
body { font-family: var(--sans); }             /* keep the stack, inherit the size */
```
Every Tailwind rem size then scales with the user's setting. Do this **after**
T-2/T-3, or the Session screen breaks (below). Consider clamping the root with
`font-size: clamp(14px, 1em, 22px)` so the largest AX sizes don't wreck the
one-column layout.

#### T-2 — Pixel-sized text and icons won't follow the setting ⚠️
Once T-1 is in, the H-2 labels stay at 9–10 px while everything around them
grows. The 112 `lucide-react` icons are sized with a numeric `size={…}` (px),
so icons would shrink relative to their labels. Most visible: the nav, the
header back buttons (`w-9 h-9` with an 18 px icon), and the set-row ✓ button.

**Fix:** H-2 for text. For icons in text-adjacent spots (nav, buttons, row
actions), pass `size="1.25em"`; lucide accepts string sizes. Decorative icons
can stay in px.

#### T-3 — What breaks at ~137 % text (root 22 px) ❌
- **Session set row** (`SetRow.tsx`): the weight input collapses to a sliver,
  and the ✓ complete button is pushed **outside the tile** and clipped. This is
  the core logging interaction.
- **Plan your week** (`WeekPlanner.tsx:225`): the session-length chips
  (30m…90m) and the notes card overflow horizontally. The shell's
  `overflow-x: clip` hides the overflow, so "90m" and the right side of the
  cards are cut off with no way to scroll to them.
- **Plan your week** day circles (`:185`, `aspect-square flex-1`): these stay
  33 px wide while the initial grows. They're still readable, but tight.
- **Session header**: the title truncates to "Upper Body P…". That's
  acceptable, since the subtitle wraps.
- **Bottom nav**: grows to 110 px. Page padding is rem-based too, so it scales
  in step, but this is further reason for the S-2 token.

**Fix:**
- Let the set row wrap at large sizes: `flex-wrap`, with the target column
  becoming `basis-full` on its own line. Size the inputs with `min-w-0 flex-1`
  instead of `w-14`. Keep the ✓ button `shrink-0`.
- Make the length chips `flex-wrap` or a `grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))]`.
- Re-test every screen at 22 px root.

---

### Corner radii

#### R-1 — Nested radii aren't concentric ⚠️
The rule: inner radius ≈ outer radius − inset. The app uses a fixed ladder
(`rounded-3xl` 24 px → `rounded-2xl` 16 px → `rounded-xl` 12 px) whatever the
padding, so inner corners look as round as, or rounder than, the containers
around them:

| Container (radius) | Inset | Child (radius) | Concentric target |
|---|---|---|---|
| `ExerciseTile` 24 (`ExerciseTile.tsx:25`) | 16 | Set rows / coach note 16 (`SetRow.tsx:161`, `ExerciseTile.tsx:56`) | 8 |
| Set row 16 (`SetRow.tsx:161`) | 10–12 | Inputs, ✓ button 12 | 4–6 |
| `Card` 24 (`Card.tsx:14`) | 20 × 16 (`CardSection`) | Inputs / chips / notices 16 (Settings, Plan, Program setup) | 4–8 |
| Bottom sheets 24 (top) | 16 | Prompt `<pre>` / import textarea 16 | 8 |
| Bottom sheets 24 (top) | 16 | Full-width buttons 16 | 8 |
| "Plan next week?" dialog 24 (`WeekPlanner.tsx:393`) | 24 | Buttons 16 | 0; better to raise the outer radius to 40 |
| Rest-timer card 24 | 32 | — | ✓ nothing corner-adjacent |
| Screen corner ~47–55 px (iPhone) | 16 side / 34 bottom | Session "Complete" / onboarding CTA 16 | ~32–39 if you want them to follow the display curve |

**Fix:** radius tokens in `@theme`, with `--radius-card: 1.5rem` and
`--pad-card: 1rem`. Derive inner radii as
`calc(var(--radius-card) - var(--pad-card))`, which gives
`--radius-inner: 0.5rem`. Apply them in the shared primitives first
(`Card`/`CardSection`, `Button` sizes, the shared input class, the new
`<BottomSheet>`), then in `ExerciseTile`/`SetRow`. Where 16 px inner corners
are wanted for style, increase the parent's radius instead (e.g. tile 32 px
with a 16 px inset). Badges, pills and `rounded-full` circles are exempt.

---

### Light / dark mode

#### D-1 — Dark-only, and it doesn't tell the browser ⚠️
There is no `prefers-color-scheme` handling anywhere. The palette is 590
hard-coded hex values across 27 files, and `html`/`body` are pinned to
`#0a0a0a` (`index.css:11–15`). A system set to light still gets the dark UI.
That's a legitimate choice, but it isn't declared:
- There's no `color-scheme: dark`, so native parts (caret, text-selection
  handles, the autofill background on Login's email/password, scrollbars, the
  iOS form accessory bar and date pickers) render in **light** styling on a
  dark page.
- `theme-color` is a single dark value, which is fine for a dark-only app.
- The `black-translucent` status bar gives white status text, which suits a
  dark-only app. If light mode ever ships, this needs revisiting (S-1's scrim
  must then change colour).

**Fix, in two steps:**
1. **Now:** declare dark-only. Add `<meta name="color-scheme" content="dark">`
   and `:root { color-scheme: dark; }`. It's cheap and fixes the native
   controls and autofill.
2. **Later (optional product decision):** move colours to semantic tokens
   (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`) in
   `@theme`. Replace the hex literals, starting with the shared primitives, then
   add a light palette under `@media (prefers-color-scheme: light)`. Also
   provide per-scheme `theme-color` metas using the `media` attribute, and
   make the status-bar scrim follow `--bg`. This is a large mechanical change
   (590 literals), so it's worth doing only if light mode is wanted.

---

## Proposed phases

Each phase can ship independently, and the order follows the dependencies
between them. Every phase needs `npm run lint` + `npm run build` green, and a
re-run of the checks in *Verification*.

### Phase 1: Foundations (tokens and meta, low risk)
- V-1: new viewport meta (keep `viewport-fit=cover`, add
  `interactive-widget=resizes-content`; the zoom lock stays until K-3 below).
- D-1 step 1: `color-scheme: dark` meta + CSS.
- `index.css`: add `--nav-h`, `--action-bar-h`, `.px-safe`, the `.pb-nav`
  utility, the `--text-2xs` token and the radius tokens (no usages yet).
- K-3: 16 px minimum font for all inputs/textareas. Then remove
  `maximum-scale`/`user-scalable`.

### Phase 2: Safe areas and fixed chrome
- S-2/S-3/H-1: shell-level nav padding in `MainApp`; delete per-page
  `pb-24`/`pb-32`.
- S-1: status-bar scrim in `App.tsx`.
- S-5: constrain the Session action bar to the shell (`max-w-md mx-auto` inner
  wrapper + `px-safe`).
- S-6: rest-timer safe-area padding + short-screen centring.
- S-7: flight landing offset. S-8: Login `pt-safe pb-safe` + scroll-safe
  centring.
- O-2: iPad detection in the install step.

### Phase 3: Shared `<BottomSheet>` and keyboard
- Build `components/shared/BottomSheet.tsx`: shell-width, `pb-safe` footer,
  `dvh` max height, `--kb` aware, and a 44 × 44 close button (the current ✕
  targets are 20 × 20 in the WeekPlanner sheets and 28 × 28 in CompleteFlow).
- Add `hooks/useVisualViewport.ts` to write `--kb`.
- Migrate the four sheets: Prompt, Import, CompleteFlow (both steps), Sports.
  This fixes S-4, S-5 (sheets), K-1 and W-2.
- K-2: `enterKeyHint`, Enter-to-advance, and scroll-padding on Session inputs.
- K-4/K-5: fixed-height onboarding root so the prompt box scrolls internally
  and the CTA stays on screen, plus a keyboard-lifted footer.

### Phase 4: Text size
- H-2: replace every `text-[9px]`/`text-[10px]` with `text-2xs`.
- T-3/H-3: reflow the set row and interval row, and wrap the Plan length chips.
- T-2: `em`-sized icons in the nav, header buttons and row actions.
- T-1: opt in to Dynamic Type (`font: -apple-system-body`) **last**, once the
  layouts survive a 22 px root.

### Phase 5: Tablet and orientation
- O-1: drop the manifest `orientation` lock.
- W-1: widen the shell at `md`/`lg` and add two-column grids on Home, Progress
  and Program.
- W-2: centred-card sheet variant at `lg`.

### Phase 6: Radii
- R-1: apply the radius tokens in `Card`, `Button`, the input class,
  `BottomSheet`, `ExerciseTile` and `SetRow`, then audit the remaining
  one-offs from the table.

### Phase 7 (optional): Light mode
- D-1 step 2: semantic colour tokens → light palette → per-scheme
  `theme-color` → scrim follows `--bg`. Only if light mode is a product goal.

## Verification (per phase)

Browser pane, with the same seeded data and simulation approach as this audit:
- 375 × 667, 375 × 812, 430 × 932, 812 × 375, 820 × 1180, 1180 × 820
- Scroll every tab to the very bottom: no content under the nav or home
  indicator.
- Open every sheet and overlay in portrait and landscape: nothing in the
  notch or home-indicator zones, and nothing wider than the shell on iPad.
- Focus every input with the keyboard simulated: the focused field and the
  sheet's primary action are both visible.
- Root font at 22 px: no clipped controls, and no horizontal overflow
  (`document.documentElement.scrollWidth === innerWidth`).

A real iPhone (installed to the home screen) and an iPad are still needed for
things the browser can't emulate: true `env()` insets, keyboard panning,
Dynamic Type, and native control colours under `color-scheme`.
