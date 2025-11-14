# YouTube Polislike

<img width="50%" alt="Screenshot 2025-11-14 at 5 04 50 PM" src="https://github.com/user-attachments/assets/88143540-f625-4238-b09c-ff3498778261" />

This a prototype of how it might work to collect polislike reaction data in response to recorded YouTube video.

There is currently no backend, and statement and vote data is hardcoded into the simple app for one specific video: [Trump's 2025 Inauguration Address](https://www.youtube.com/watch?v=0WEC6Fl-JAw)

## Longterm
- figure out seemless ways to gather reaction data from recorded and/or live youtube videos
- figure out ways to show evolving map to users
- implement silly mechanics inspired by "guitar hero" or "beat saber", but for perspective-taking of other groups responses
    - tilt device or pose body for agree/disagree/pass (toward/away/middle? lean left/right?)
    - more points for choosing majority response for a group cluster
    - unlock leaderboard when you provide all your own reaction data by reacting to full video
    - game updates as more people react to video and reaction data accumulates
    - for more challenge
        - faster and faster playback speeds 
        - perspective-taking smaller and smaller clusters
    - bonus points for auto-tuning speaker audio to music

## Roadmap
- [x] Allow loading arbitrary YouTube video.
- [x] Hardcode a set of video-specific statements, set to video timecodes.
- [x] Add timeline to show upcoming statements.
- [x] Add keyboard shortcuts for voting (D/P/A and Left/Down/Right)
- [ ] Hardcode a set of simulated votes, set to video timecodes.
- [ ] Show visual indication of agree/disagree/pass votes on statements.
- perspective map
    - [ ] Add a representation of a growing perspective map over time.
    - [ ] Figure out a way to show votes of groups over time
- transcription
    - [x] find pre-created audio transcript
    - [ ] display live transcription in UI
    - [ ] pre-process audio into transcript
    - [ ] live-process audio into transcript
- statement generation
    - [x] manually generate and timecode some statements
    - [ ] pre-process statements from a transcript
    - [ ] figure out UX to solicit _spoken_ statements from viewers
    - [ ] figure out UX to solicit _custom_ statements from viewers
 
# Inspiration
- [VR Design Unpacked: The Secret to Beat Saber’s Fun Isn’t What You Think](https://www.roadtovr.com/beat-saber-instructed-motion-until-you-fall-inside-xr-design/)  
  > The scoring system is actually based on motion. In fact, it’s actually designed to make you move in specific ways if you want the highest score. [...] And while Beat Saber has music that certain helps you know when to move, more than a rhythm game… it’s a **motion game**. Specifically, Beat Saber is built around a VR design concept that I like to call ‘**Instructed Motion**’, which is when a game asks you to move your body in specific ways.
- [Wikipedia: Perspective-taking](https://en.wikipedia.org/wiki/Perspective-taking)  
  > Perspective-taking is the act of perceiving a situation or understanding a concept from an alternative point of view, such as that of another individual [or group]. A vast amount of scientific literature suggests that perspective-taking is **crucial to human development** and that it may lead to a variety of beneficial outcomes.

## Resources
- https://www.w3.org/TR/orientation-event/
- https://docs.ml5js.org/#/reference/bodypose

## Development

```
npm install
npm start
```

Visit the interface at https://localhost:3000
