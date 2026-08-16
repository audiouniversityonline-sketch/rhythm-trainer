# Audio files

Nothing here yet. The tool synthesizes stand-in sounds until real files are dropped in.

## Drum sounds

Put these five files in this folder (`audio/`), then open `index.html` and set
`CONFIG.useSamples = true` near the top of the `<script>` block.

| File | Used for |
| --- | --- |
| `hihat.wav` | Hi-hat voice |
| `snare.wav` | Snare voice |
| `kick.wav` | Kick voice |
| `rim.wav` | Rim / cross-stick voice |
| `click.wav` | Metronome click |

Requirements:

- **One-shot samples**, trimmed so the transient starts at sample zero. Any silence at
  the head of the file becomes timing error, since playback is scheduled to the exact
  sample time.
- **Short.** Under 400 ms. At fast tempos long tails smear the grid.
- **Mono or stereo, 44.1 or 48 kHz.** Both work.
- **Normalized but not limited into the ceiling.** Peak around -3 dBFS leaves headroom
  when several voices land on the same subdivision.

The tool falls back to the synthesized version of any file that fails to load, so a
missing or misnamed file degrades quietly rather than breaking playback.

## Performance examples

Recordings of Ernesto playing each polyrhythm go in `audio/examples/`, named by ratio:

| File | Polyrhythm |
| --- | --- |
| `examples/3-2.wav` | 3 against 2 |
| `examples/4-3.wav` | 4 against 3 |
| `examples/5-4.wav` | 5 against 4 |
| `examples/5-3.wav` | 5 against 3 |
| `examples/7-4.wav` | 7 against 4 |

The higher number comes first, matching the labels on the ladder buttons.

Set `CONFIG.useExamples = true` once they are in place. Until then the example player
shows a disabled button naming the file it is waiting for.

These can be any length. If they get long, converting to `.mp3` or `.m4a` and updating
`CONFIG.exampleUrl` will keep the repo small, since GitHub Pages serves the whole
repository on every visit.
