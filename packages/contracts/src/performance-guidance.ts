/** One English source for installed Skills, the on-demand MCP guide and M10 staging input. */
export const PerformanceGuidance = {
  commands: ['say', 'comment', 'changeBg', 'changeFigure', 'characterDifference', 'changeIllustrationDiff', 'setAnimation', 'setTransform', 'wait'],
  principles: `Follow the author's explicit staging requirements first. Preserve dialogue, speakers, plot, branches and stable statement IDs. Use the actual current command, animation preset and character-difference catalogs; never invent assets or difference IDs.
For ordinary dialogue, keep a stable composition. Change expression when the line's emotion changes, not on every line. For an image expression swap, recommend a short fade around 120–180 ms while retaining the existing object, station and framing. characterDifference shares a named character difference with the reading avatar; changeFigure op:replace changes the existing instance. A replacement is not a first entrance: keep reset:false and retain unspecified placement.
For a first entrance recommend a 200–300 ms fade, or the actual slideInLeft/slideInRight core preset with modest displacement. For an exit use fadeOut or slideOutLeft/slideOutRight once the character leaves the conversation; do not remove a character merely because another person speaks. Read animationPresets by key: factory keys such as jump are not animation asset IDs. stage.applyAnimationPreset creates/binds the actual native tracks; raw setAnimation needs a real presetId asset reference.
Use a small jump (about 280–400 ms, amplitude 12–24 px, one cycle) for clear surprise or delight, and a brief shake (about 250–350 ms, amplitude 4–8 px) only for a matching emotion. These are adjustable recipes, not new engine defaults. Keep daily conversation restrained.
Let a reaction overlap the following dialogue with parallel:true when the command supports it. Use cross:true only when the exact command semantics require crossing the next interaction. Ordinary say already waits for reading. Add wait around 120–250 ms only for a deliberate silent beat, or wait for a required action to finish; avoid stacking waits after every line. Resume existing objects after a pause; restore/save follows the owning runtime state rather than replaying entrance media.`,
  shortScene: `Complete short scene recipe — a quiet greeting, one surprised reaction, then a departure.
Discover the actual background, character and named differences first. Read commands changeBg/changeFigure/characterDifference/setAnimation/wait and the animationPresets entry jump. Prepare the actual core jump through stage.applyAnimationPreset with durationMs:320, amplitude:18, cycles:1 and stageTarget:{kind:"object",id:theStageObjectId}; use its real imported animation identity for setAnimation. The illustrative IDs below are local example bindings, never IDs to send into another project: BgRoom=background, ChrMio=character, FigMio=figure, ObjMio=stage instance, Jump01=created jump animation. neutral/smile/surprised must be replaced by the character's actual named difference IDs. Preserve the existing dialogue/statement IDs when adapting an authored scene.

changeBg {"op":"show","assetId":"BgRoom","transition":{"enter":{"preset":"fade","durationMs":250}}} @Bg0001;
characterDifference {"characterId":"ChrMio","differenceId":"neutral"} @Dif001;
changeFigure {"op":"show","objectId":"ObjMio","characterId":"ChrMio","assetId":"FigMio","difference":true,"station":"leftThird","transition":{"enter":{"preset":"fade","durationMs":250}}} @Ent001;
say {"speaker":{"kind":"character","id":"ChrMio"},"text":"You kept the light on."} @Say001;
characterDifference {"characterId":"ChrMio","differenceId":"surprised","transition":{"preset":"fade","durationMs":150}} @Dif002;
setAnimation {"presetId":"Jump01","target":{"kind":"object","id":"ObjMio"},"durationMs":320,"parallel":true} @Act001;
say {"speaker":{"kind":"character","id":"ChrMio"},"text":"Oh—you remembered!"} @Say002;
wait {"durationMs":180} @Pau001;
characterDifference {"characterId":"ChrMio","differenceId":"smile","transition":{"preset":"fade","durationMs":150}} @Dif003;
say {"speaker":{"kind":"character","id":"ChrMio"},"text":"I'll bring the others. Wait here."} @Say003;
changeFigure {"op":"exit","objectId":"ObjMio","transition":{"exit":{"preset":"fade","durationMs":250}}} @Ext001;
say {"speaker":{"kind":"narrator"},"text":"Her footsteps fade into the corridor."} @Say004;
end {} @End001;

The reaction overlaps Say002; Pau001 supplies one intentional silent beat. The first entrance sets placement, expression changes retain it, and the exit follows the departure line. Adapt timing to the story and author intent. Missing references remain explicit comment notes rather than fabricated bindings.`,
} as const;
