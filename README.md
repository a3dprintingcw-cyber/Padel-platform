# Padel Vitals 

Player development app for padel clubs. Coaches rate every player who trains at the club, players log in and see their own progress. One club per state.

Static site, no build step. Open `index.html` and it runs.

| File | What it is |
|---|---|
| `index.html` | Sales home for club owners |
| `states.html` | One club per state: which states are open |
| `pricing.html` | Four plans in USD, monthly or yearly |
| `register.html` | Club registration, sends to WhatsApp or email |
| `app.html` | The player, coach and bar app, demo club in Miami |

## Day to day

- **Mark a state as taken:** edit `STATUS` in `assets/clubs.js`, for example `"FL": {status:"taken", club:"Miami Padel Club"}`. Use `"talks"` for in talks.
- **Change prices or perks:** `PLANS` in `assets/clubs.js`.
- **Change where registrations go:** `CONTACT` in `assets/clubs.js`.

## Not built yet

Real accounts and login, a backend, payments. All app data is sample data kept on the device.
