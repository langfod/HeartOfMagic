# Features to Test

Testing checklist for SpellLearning panel features. Check off each item once confirmed working in-game or via dev harness.

---

## Auto-Advance Learning Target

When a spell is mastered (100% XP), automatically select the next spell to learn.

### Settings UI
- [ ] Toggle appears in Progression settings section (below Discovery Mode / Show Root Names)
- [ ] Toggle defaults to ON
- [ ] Mode dropdown shows "Next in Branch" and "Random in School"
- [ ] Mode dropdown defaults to "Next in Branch"
- [ ] Turning toggle OFF grays out the mode dropdown
- [ ] Turning toggle back ON re-enables the dropdown
- [ ] Setting persists after closing and reopening the panel (save/load)
- [ ] Reset Settings restores toggle ON + mode to "Next in Branch"

### Branch Mode
- [ ] Master a spell that has one available child — that child becomes the new learning target
- [ ] Master a spell that has multiple available children — one is picked (random)
- [ ] Master a leaf node (no children) — falls back to any available spell in the same school
- [ ] Master a spell whose children are all still locked (prereqs not met) — falls back to school-wide pick

### Random Mode
- [ ] Master a spell — a random available (non-root) spell in the same school is picked
- [ ] Picked spell is not a root node

### Learning Modes
- [ ] **perSchool mode**: Auto-advance only changes the target for the mastered spell's school, other schools unaffected
- [ ] **single mode**: Auto-advance clears all existing targets before setting the new one
- [ ] **single mode**: Only one learning target exists after auto-advance

### Visual Feedback
- [ ] Status bar shows "Now learning: {spell name}" after auto-advance
- [ ] Console log shows `[SpellLearning] Auto-advanced to: {name} ({school})`
- [ ] New target node shows learning state (color/animation) on the tree
- [ ] Learning path lines update to the new target in CanvasRenderer

### Edge Cases
- [ ] All spells in school mastered — no error, no target set, silent no-op
- [ ] Toggle OFF — mastering a spell does NOT auto-advance
- [ ] No tree data loaded — no error
- [ ] Mastering via cheat unlock — does NOT trigger auto-advance (cheat flow is separate)
