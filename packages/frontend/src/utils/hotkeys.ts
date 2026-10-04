// Keyboard chords shared by the canvas shortcuts and the text editor, so both
// agree on what undo and redo are. Matched on `key`, not `code`: Ctrl+Z is
// wherever the Z is printed, on AZERTY as on QWERTY. Alt is excluded because
// AltGr reports as Ctrl+Alt on Windows.
type Chord = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export const isModChord = (e: Chord) => (e.ctrlKey || e.metaKey) && !e.altKey

export const isUndoHotkey = (e: Chord) =>
    isModChord(e) && !e.shiftKey && e.key.toLowerCase() === 'z'

export const isRedoHotkey = (e: Chord) =>
    isModChord(e) && (e.shiftKey ? e.key.toLowerCase() === 'z' : e.key.toLowerCase() === 'y')

// For tooltips: the modifier as the platform prints it.
export const MOD_LABEL = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
