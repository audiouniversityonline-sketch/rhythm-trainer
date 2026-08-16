/* ============================================================
   lessons.js — the lesson sets.

   Each step names a pattern from patterns.js, a tempo, how many bars
   to hold it, and the timing score needed to pass. Edit freely; the
   app reads this file at load and nothing else needs changing.

     pattern   id from patterns.js
     bpm       starting tempo
     bars      bars to sustain before it is graded
     minScore  timing score needed to pass, 0 to 100
     limbs     which limbs the student plays (the rest are played for
               them). "R" right hand, "L" left hand, "F" foot.
     note      one line shown while the step is active
   ============================================================ */
window.LESSONS = {
  sets: [
    {
      id: "first-steps",
      title: "First steps",
      blurb: "Get the hands and foot moving together in straight time.",
      steps: [
        { pattern:"str-44-quarters", bpm:70, bars:8, minScore:70, limbs:["R"],
          note:"Quarter notes on the hi-hat. Watch the count row and stay relaxed." },
        { pattern:"str-44-eighths", bpm:70, bars:8, minScore:70, limbs:["R"],
          note:"Same tempo, twice as many notes. The click has not moved." },
        { pattern:"str-44-eighths", bpm:70, bars:8, minScore:70, limbs:["R","F"],
          note:"Add the kick on beats 1 and 3." },
        { pattern:"str-44-rock", bpm:70, bars:8, minScore:72, limbs:["R","L","F"],
          note:"The whole beat. Snare on 2 and 4, kick on 1 and 3." },
        { pattern:"str-44-rock", bpm:92, bars:8, minScore:72, limbs:["R","L","F"],
          note:"Same beat, faster. Keep the spacing even." }
      ]
    },
    {
      id: "around-the-kit",
      title: "Around the kit",
      blurb: "Move off the hi-hat and onto the crashes, ride and toms.",
      steps: [
        { pattern:"kit-around-toms", bpm:64, bars:8, minScore:70, limbs:["R"],
          note:"Snare, rack 1, rack 2, floor. One hand, four surfaces — learn where they are." },
        { pattern:"kit-two-crashes", bpm:60, bars:8, minScore:68, limbs:["R"],
          note:"Crash on beat 1, the other crash on beat 3. Reach without rushing." },
        { pattern:"kit-crash-one", bpm:74, bars:8, minScore:70, limbs:["R"],
          note:"A rock beat, but beat 1 is a crash. The hand comes straight back to the hi-hat." },
        { pattern:"kit-ride", bpm:80, bars:8, minScore:72, limbs:["R","L"],
          note:"Same beat on the ride. Keep the snare where it was." },
        { pattern:"kit-tom-fill", bpm:64, bars:8, minScore:66, limbs:["R","L"],
          note:"Hands alternating down the toms. Right leads." },
        { pattern:"kit-groove-fill", bpm:70, bars:8, minScore:64, limbs:["R","L","F"],
          note:"Two beats of groove, two beats of fill, crash to land it." },
        { pattern:"kit-full", bpm:66, bars:8, minScore:62, limbs:["R","L","F"],
          note:"Everything at once. Slow it down as far as you need." }
      ]
    },
    {
      id: "reading",
      title: "Reading rhythms",
      blurb: "Open the notation, hide the grid, and play what you read.",
      reading: true,
      steps: [
        { pattern:"rd-1", bpm:64, bars:4, minScore:68, limbs:["R"],
          note:"Read it before you play it. Say the count out loud first." },
        { pattern:"rd-2", bpm:64, bars:4, minScore:68, limbs:["R"],
          note:"Notes on the and of 2 and the and of 4." },
        { pattern:"rd-3", bpm:64, bars:4, minScore:68, limbs:["R"],
          note:"A dotted quarter pushes the third note off the beat." },
        { pattern:"rd-4", bpm:60, bars:4, minScore:65, limbs:["R","F"],
          note:"Sixteenths mixed with longer values." },
        { pattern:"rd-5", bpm:60, bars:4, minScore:65, limbs:["R","F"],
          note:"Syncopation. Nothing lands on beats 2 or 4." },
        { pattern:"rd-6", bpm:60, bars:4, minScore:65, limbs:["R","F"],
          note:"Triplet subdivision. Count one-trip-let." }
      ]
    },
    {
      id: "odd-time",
      title: "Odd time",
      blurb: "Five and seven, still conventional music.",
      steps: [
        { pattern:"odd-54-32", bpm:76, bars:8, minScore:70, limbs:["R"],
          note:"Five four grouped three plus two. Feel the accent shift." },
        { pattern:"odd-54-23", bpm:76, bars:8, minScore:70, limbs:["R"],
          note:"Same bar length, grouped two plus three. Completely different feel." },
        { pattern:"odd-78-223", bpm:120, bars:8, minScore:68, limbs:["R","L"],
          note:"Seven eight as two plus two plus three. Count the eighths." },
        { pattern:"odd-78-223", bpm:120, bars:8, minScore:70, limbs:["R","L","F"],
          note:"Add the foot on the group starts." },
        { pattern:"odd-74", bpm:84, bars:8, minScore:68, limbs:["R","L","F"],
          note:"Seven four. Long bars, easy to lose count." }
      ]
    },
    {
      id: "polyrhythms",
      title: "Polyrhythms",
      blurb: "Two rates at once, working up the ladder.",
      steps: [
        { pattern:"poly-3-2-in2", bpm:60, bars:8, minScore:70, limbs:["R","L"],
          note:"Three against two. Say not dif-fi-cult." },
        { pattern:"poly-3-2-in3", bpm:60, bars:8, minScore:70, limbs:["R","L"],
          note:"The same rhythm counted in three. Notice what changed and what did not." },
        { pattern:"poly-4-3-in4", bpm:56, bars:8, minScore:68, limbs:["R","L"],
          note:"Four against three. Say pass the god damn but-ter." },
        { pattern:"poly-4-3-in3", bpm:56, bars:8, minScore:68, limbs:["R","L"],
          note:"Counted in three, so the same figure becomes dotted eighths." },
        { pattern:"poly-5-4-in5", bpm:52, bars:8, minScore:64, limbs:["R","L"],
          note:"Five against four. No mnemonic, use the gap numbers." },
        { pattern:"poly-7-4-in4", bpm:48, bars:8, minScore:60, limbs:["R","L"],
          note:"Seven against four. Slow it further if you need to." }
      ]
    }
  ]
};
