# TryList

Watch it. Eat it. Do it.

Phase 1 of 5 — this build has the app shell (login, landing screen, bottom
tab bar) and a fully working **Watch** list. Food and Activities are stubbed
placeholders, ready for Phase 2.

## What's in this phase

- Pick-a-user login (Jade / John, no password) — remembered on this device
- Landing screen with three themed cards (Watch / Food / Activities)
- Bottom tab bar to switch between sections once inside
- Watch list: add, edit, delete, tag (multi-select), format (Movie/Series)
- Mark watched / back to to-watch
- Star rating (0–5, half-star steps) with location (Home/Cinema) and a
  written review, tracked as a **history** — rewatches don't overwrite past
  ratings
- Filter by status, format, tag, and who added it
- Installable to your phone's home screen (PWA)

## 1. Set up Firebase

You can reuse the **same Firebase project** as Our Life List — TryList just
adds three new collections (`watchItems`, `foodItems`, `activityItems`), so
there's nothing to migrate.

1. Go to the [Firebase console](https://console.firebase.google.com/), open
   your existing project (or create a new one if you'd rather keep it
   separate).
2. Project settings → General → "Your apps" → if you don't already have a
   Web app registered, add one.
3. Copy the `firebaseConfig` object it gives you.
4. Paste those values into `js/firebase-config.js` in this project,
   replacing the placeholders.
5. In the Firebase console, go to **Firestore Database** and make sure it's
   enabled (it should already be, from Our Life List).

### Firestore rules — a quick note

Because login here is just "pick Jade or John" (no password), it isn't real
authentication — it's for **attribution, not security**. Firestore's default
rules block all reads/writes until you open them up. The simplest option for
a two-person household app is to allow open read/write on these three
collections while keeping everything else locked down:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /watchItems/{doc} { allow read, write: if true; }
    match /foodItems/{doc} { allow read, write: if true; }
    match /activityItems/{doc} { allow read, write: if true; }
  }
}
```

This means anyone with the URL could technically edit the lists — fine for
sharing between the two of you, but worth knowing. If you'd rather lock it
down properly later (e.g. real Firebase Auth), that's a small follow-up
project, not a rebuild.

## 2. Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `trylist`) and push this whole folder to
   it.
2. In the repo: **Settings → Pages → Source** → deploy from the `main`
   branch, root folder.
3. GitHub will give you a URL like `https://yourusername.github.io/trylist/`.
4. Open that URL on your phone → browser menu → **Add to Home Screen**. It
   will behave like an installed app (own icon, no browser bar).

## 3. What's next (Phase 2+)

- Food list: places, categories, cost, multiple locations, category
  scoring (out of 10, auto-averaged), visit history
- Activities list: places, cost, thumbs up/down + review, visit history
- Mapbox map view for Food and Activities, with multi-location pins
- Everything filterable, "added by" shown throughout (same pattern as Watch)

No changes needed to what's already built — Phase 2 slots into the same
app shell and tab bar.
