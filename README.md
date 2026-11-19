# Iedereen Speelt

**Eerlijk wisselen bij jeugdvoetbal** — a small phone app that helps the parent
on the sideline give every child fair playing time.

- Pick who is here today, then for each match: opponent, length (20/30/40 min)
  and 4, 5 or 6 players on the field.
- A big match clock, a scoreboard, and green (field) / orange (bench) player cards
  showing each child's playing time today.
- Every few minutes it suggests who comes off and who goes on: the child who has
  played most goes off, the child who has played least comes on. One tap to do it,
  or swap by hand with two taps. Every change can be undone.
- At the end of the day: results and playing time per child.
- Works offline. Everything is stored **only on your phone** — nothing is uploaded.

## Install on your phone

1. Open the app's address in **Safari** (iPhone) or **Chrome** (Android).
2. iPhone: **Share → Add to Home Screen**. Android: menu **⋮ → Install app**.
3. Open it from the home screen. The team is already there; add, rename or remove
   players in the **Team** tab.

Use it from the home-screen icon: Safari may clear data of websites that are not
added to the home screen after 7 days without use.

## How the suggestions work

The suggestions are a simple, predictable rotation — nothing is ever changed
without a tap:

1. A child marked injured / resting / gone home who is still on the field comes off first.
2. Empty places on the field are filled.
3. Otherwise, at each reminder: children who have been on for at least 3 minutes
   are candidates to come off (longest playing time today first); the bench child
   with the least playing time today comes on. A swap is skipped if the incoming
   child has already played more than the outgoing one, and no rotation is
   suggested in the last minute of a match. Someone on for 8+ minutes is
   prioritised.

Playing time is computed from a log of events (kick-off, pause, substitution,
undo, …) with timestamps, so it stays exact when the phone is locked, the app is
reloaded, or the page is closed. Fairness numbers (average, difference between
most and least played) are shown as information only.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev        # development server (add --host to try it on a phone on the same Wi-Fi)
npm test           # unit, component and full match-day simulation tests
npm run typecheck
npm run build      # production build into dist/
npm run preview    # serve the production build (offline/PWA behaviour)
npm run simulate   # print fairness indicators for simulated match days
```

Code layout:

| Path | What |
|---|---|
| `src/domain/` | Pure TypeScript: event log, replay (all statistics), commands, suggestion engine, lineup, summary. No React, no browser APIs. |
| `src/store/` | IndexedDB persistence and the React store. |
| `src/platform/` | Wake lock, vibration/beep, service-worker updates. |
| `src/ui/` | Screens and components (React + Tailwind). |
| `tests/` | Vitest tests; `tests/ui` uses Testing Library with an in-memory IndexedDB. |

## Deployment

Every push to `main` runs the tests, builds, and publishes to **GitHub Pages**
(`.github/workflows/deploy.yml`). One-time setup by a repository admin:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

The build uses relative paths, so the same `dist/` also works on Netlify or
Vercel as a static site.

## Known limitations

- Data lives on one phone; two parents cannot share a match day.
- Reminders only sound/vibrate while the screen is on. iPhones never vibrate for
  web apps, and the beep needs the phone off silent. The app keeps the screen on
  during a match where the browser supports it.
- No export (CSV/PDF) yet.
