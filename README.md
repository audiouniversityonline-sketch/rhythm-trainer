# Rhythm Trainer

A free browser tool for learning rhythm — straight time, odd time, polyrhythms, and
reading — playable with your own drum kit over USB. Drum instruction by Ernesto
([@ethedrummer](https://instagram.com/ethedrummer)).

Static files, no build step, no dependencies, no network calls. Publish the repo with
GitHub Pages and it runs.

## Files

| File | What it is |
| --- | --- |
| `index.html` | App shell markup |
| `styles.css` | Design system and layout |
| `app.js` | Clock, scheduler, views, input, scoring, lessons |
| `notation.js` | The notation engraver |
| `patterns.js` | **The rhythm library — edit this to add rhythms** |
| `lessons.js` | **The lesson sets — edit this to add lessons** |
| `audio/` | Drum samples and Ernesto's performance clips (see its README) |

## Running it locally

Because it loads several scripts, open it over http rather than double-clicking the
file. From the project folder:

```bash
python3 -m http.server 8123
```

Then visit `http://localhost:8123`. Web MIDI also requires this — it will not work from
a `file://` URL.

## The rhythm library

Five groups, 36 patterns:

- **Polyrhythms** — 3:2, 4:3, 5:4, 5:3, 7:4, each countable from either side
- **Straight time** — quarters, eighths, sixteenths, a rock beat, triplets, shuffle,
  waltz, 6/8
- **Odd time** — 5/4 as 3+2 and as 2+3, 7/8 as 2+2+3, 5/8, 7/4
- **Around the kit** — crash accents, ride grooves, tom runs and fills
- **Reading** — sparse rhythms with rests, for sight-reading rather than groove

A pattern describes one bar. To add one, copy an entry in `patterns.js` and change the
numbers:

```js
mk({ id:"str-44-rock", name:"Basic rock beat", short:"4/4", group:"straight",
     sig:[4,4],        // time signature
     div:8,            // boxes the bar is cut into — here, eighths
     ticks:4,          // metronome clicks per bar; bpm counts these
     accents:[2,2,3],  // optional grouping, for odd time
     voices:{ R:[0,1,2,3,4,5,6,7], L:[2,6], F:[0,4] } })
```

Onsets are box indices. `R` is the right hand, `L` the left, `F` the foot. Everything
else — kit, grid, wheel, balls, composite, notation, scoring, metronome — is derived
from that one object.

### Playing the whole kit

A limb moves between surfaces, so a pattern can say which drum each hit lands on:

```js
kit:   { R:"hihat", L:"snare", F:"kick" },   // each limb's home drum
marks: { R:{ 0:"crash1", 8:"tom1" } }        // exceptions, by box index
```

That is how "the right hand rides the hi-hat all bar and reaches for a crash on one"
is expressed. Omit `kit` and the limb uses whatever the student picked in Setup.

Available surfaces: `hihat`, `ride`, `crash1`, `crash2`, `snare`, `rim`, `tom1`, `tom2`,
`floor`, `kick`. Each has its own synthesized voice, its own place on the kit drawing,
its own staff position in the notation, and its own MIDI mapping.

## Counting a polyrhythm from either side

4 against 3 and 3 against 4 are the same rhythm. The **count it in** switch flips which
voice you feel as the pulse, which changes the time signature, the count row, the foot
part, and the notation, while the rhythm itself stays put. That flip is the single most
useful thing in the tool.

## Learning the interface

A guided tour runs the first time you open it: a green frame lands on each part of the
screen with an arrow and a sentence explaining it — where the rhythms live, what the kit
drawing is doing, how to start with one limb, how to connect a kit, how scoring works.
Nine steps, skippable, and replayable any time from the **Guide** button in the top bar.

After that a smaller green marker follows you around, pointing at whatever you should do
next: turn on a limb, press play, start playing along. It updates as your situation
changes and disappears once you are going. Dismiss it with the × and it stays gone.

## The interface

An app shell rather than a scrolling page: library and lessons in the left sidebar,
the rhythm on the stage, live feedback in the right rail, and a transport pinned to the
bottom that never moves. Everything you only touch occasionally — kit assignment, MIDI,
calibration, practice options — lives in the Setup drawer, so the working surface stays
about the rhythm.

Below 1080px the rail drops beneath the stage; below 860px the sidebar becomes a
slide-over and the transport keeps only play, tempo, and bars.

Colours carry one meaning throughout: amber is the right hand, teal the left, violet the
foot. Whatever lights up in the kit, the wheel, the grid, the notation, and the timing
plot is the same limb.

## Views

Every view is independently hidable from the view row above the stage, and the choice is
remembered. **Reading only** hides the grid, wheel, balls, and composite so the student
genuinely reads instead of watching lights; **Everything** brings them back.

- **Limbs** — three blocks that flash on each hit, meant to be caught peripherally
  while playing
- **Kit** — the drums drawn from the drummer's seat: snare closest and centre-left,
  kick beyond it, hi-hat out to the left, floor tom and ride to the right. Each piece
  lights in its limb's colour as it is struck, and pieces not assigned to a limb stay
  dimmed so the shape of the kit still reads
- **Wheel** — three rings with a spoke per subdivision, showing where beats fall
  around the bar
- **Balls** — bouncing between consecutive onsets, so it works for uneven rhythms too
- **Grid** — the bar as boxes, with sticking and count rows
- **Composite** — what the hands actually play, with gap sizes or a spoken mnemonic
- **Notation** — the bar written out, with a playhead line scrolling across it in time

## Lessons

Five sets ship in `lessons.js`: first steps, around the kit, reading rhythms, odd time,
and polyrhythms.
Pick one and the tool loads each step's pattern and tempo, counts the bars, grades the
timing, and advances when the target is met. Progress is saved in the browser.

A step looks like this:

```js
{ pattern:"str-44-rock", bpm:70, bars:8, minScore:72, limbs:["R","L","F"],
  note:"The whole beat. Snare on 2 and 4, kick on 1 and 3." }
```

## Playing along

### Your own kit

Open **Setup → Play your own kit** and press connect. Any USB electronic kit, trigger
module, or MIDI controller works.

Every surface has its own row and its own **Learn** button — both crashes, ride, hi-hat,
snare, both rack toms, floor tom and kick. Press Learn, hit the pad, and that note is
bound to that drum (and removed from any other, so you cannot double-assign). Defaults
follow the General MIDI drum map, so most kits work untouched. A green dot marks the
drums the current exercise actually uses, and the last note received is echoed back so
an unmapped pad is obvious.

Because mapping is per drum rather than per limb, hitting the ride when the exercise
wants the hi-hat does not score. You have to hit the right surface.

- **Web MIDI needs an https page** — fine on GitHub Pages, not from `file://`
- **Chrome, Edge, and Firefox** support it; Safari's support is newer and less
  reliable, so iPad users fall back to the on-screen pads
- MIDI timestamps are converted into the audio clock via
  `AudioContext.getOutputTimestamp()`, so hits are compared against the audio the
  player actually heard

Without a kit, play with `F`, `J`, and `B`, or tap the three on-screen pads.

The three pads relabel themselves depending on what you are playing. With no kit
connected they read as keyboard keys — `J`, right hand, hi-hat. Once a kit is
connected they read as the drums themselves — Hi-hat, right hand, note 42 — because
`F`, `J`, and `B` are meaningless when you have sticks in your hands. The instruction
line under the score changes with them. Every incoming hit lights its pad, from the
keyboard or the kit, so you can always see that the software is receiving you.

### One limb at a time

Three limbs at once is a lot, especially on MPC-style pads. The **Limbs you're
playing** row turns each limb's grading on and off independently, so you can start
with the right hand alone, get it steady, then add the left, then the foot. The full
pattern keeps playing either way — disabling a limb only stops it being graded, and
its pad dims to show it is out of play. Lesson steps set this for you as they
progress.

### Calibration

Press **Calibrate**, then play along with the click for a few bars. The median offset is
stored per input source — keyboard and MIDI separately — and subtracted before your
hits are plotted. It does not change your score, since scoring already ignores constant
offset; it makes the "your timing runs X late" readout describe your playing rather
than your gear.

### Scoring

**Graded on rhythmic consistency, not absolute accuracy.** A constant offset is
measured, reported separately, and subtracted before scoring. Tolerance is keyed to each
limb's own note spacing rather than the composite subdivision, so 7:4 is graded as
fairly as 3:2.

Roughly, at 72 bpm:

| Your consistency | Score |
| --- | --- |
| ±25 ms | 100, "Locked in" |
| ±60 ms | ~93, "Solid" |
| ±120 ms | ~75, "Getting there" |
| genuinely random | under 50 |

**Scored a bar at a time.** Each bar gets its own score — the sum of its hit weights
over the hits that bar expected, so dropping notes costs the same as playing them
badly. The headline number is the average of the last eight *completed* bars, so it
settles once a measure instead of lurching on every hit. Until the first bar finishes it
shows a dot rather than a number. The strip under it is the per-bar history, which is
where you actually see whether you are steadying or coming apart.

Hit weighting is a smooth falloff rather than a set of thresholds, so a hit drifting
across a boundary can no longer jolt the score.

### How a lesson is graded

A step runs for its set number of bars, stops itself, and grades the whole run at once.

The grade is a **trimmed mean of the per-bar scores**: the weakest bar — or the weakest
15% on longer runs — is set aside as a fluke. A fumbled entry or one lost bar cannot
sink an otherwise clean run. Trimming by score rather than by position means a strong
opening bar still counts toward you, while a sustained collapse still shows up, because
only the flukes get removed. Bars where nothing was played score zero, so you cannot
pass by playing half of it.

In practice, at a target of 70:

| What you played | Grade |
| --- | --- |
| Fumbled the entry, clean after | 100, pass |
| One bad bar in the middle | 99, pass |
| Steady but loose throughout | ~88, pass |
| Clean for half, fell apart after | ~75, marginal pass |
| Never settled | ~45, fail |
| Stopped playing halfway | ~57, fail |

## Keyboard

| Key | Action |
| --- | --- |
| `space` | play / stop |
| `↑` `↓` | tempo by 1 (hold shift for 5) |
| `F` `J` `B` | left hand / right hand / foot |

## Audio

Sounds are synthesized with the Web Audio API. Real WAV samples drop in without code
changes — see [`audio/README.md`](audio/README.md).

All timing comes from the Web Audio clock via a lookahead scheduler, and the animation
reads `audioContext.currentTime` every frame, so audio and visuals never drift apart.

## Notation, and what it does not do

The engraver computes note values from onset spacing, adds dots and ties, fills gaps
with rests, beams by beat group (or by accent group in eighth-denominator meters like
7/8), and brackets per-beat tuplets on triplet grids. Polyrhythms take a separate path
with a whole-bar tuplet bracket, which is how they are actually written.

Drums do not sustain, so a note runs to the next hit but never past the end of its own
beat. That is what makes rests land where a reader expects them.

Not implemented: multiple bars per exercise, pickup bars, repeats, dynamics, ghost
notes, flams, or grace notes. Spacing is proportional to the subdivision grid rather
than classically engraved.

## Known limits

- **Mnemonics exist only for 3:2 and 4:3.** The others show gap counts instead.
- **Haptics** use `navigator.vibrate`, which Android supports and iOS Safari does not.
- **Progress is per-browser.** Clearing site data or switching devices loses it.
- **Three limbs, not four.** There is no separate hi-hat foot voice yet. Adding one
  means a fourth voice in the pattern model and a fourth row everywhere it appears.

## Publishing

Push to GitHub, then Settings → Pages → deploy from the default branch, root folder.
