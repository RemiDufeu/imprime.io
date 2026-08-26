import type { Presentation, Slide } from '@imprime/sdk'

// Minimal shape of the state these selectors read, so they can be applied both
// to a React subscription (`useEditorStore(selectCurrentSlide)`) and to a plain
// snapshot inside a slice action (`selectCurrentSlide(get())`).
export interface CurrentSlideState {
    presentation: Presentation | null
    currentSlideIndex: number
}

// The slide currently being edited. Single definition of that lookup — slice
// actions can't call `useCurrentSlide`, so without this they each re-derive it.
export const selectCurrentSlide = (s: CurrentSlideState): Slide | null =>
    s.presentation?.slides[s.currentSlideIndex] ?? null
