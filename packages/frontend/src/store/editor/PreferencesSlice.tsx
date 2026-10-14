import type { StateCreator } from 'zustand'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
export const DEFAULT_ZOOM = 1
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
// One row of swatches in the colour picker's panel.
export const MAX_RECENT_COLORS = 8

export interface PreferencesSlice {
  zoom: number
  pagesPanelOpen: boolean
  layersPanelOpen: boolean
  // The colours last picked, in any template, most recent first.
  recentColors: string[]
  setZoom: (zoom: number | ((prevZoom: number) => number)) => void
  setPagesPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setLayersPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  addRecentColor: (color: string) => void
}

export const createPreferencesSlice: StateCreator<
  PreferencesSlice,
  [],
  [],
  PreferencesSlice
> = (set, get) => ({
    zoom: DEFAULT_ZOOM,
    pagesPanelOpen: true,
    layersPanelOpen: true,
    recentColors: [],
    setZoom: (newZoom) => {
        const prevZoom = get().zoom
        const nextZoom = typeof newZoom === 'function' ? newZoom(prevZoom) : newZoom
        set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) })
    },
    setPagesPanelOpen: (open) => {
        const prev = get().pagesPanelOpen
        set({ pagesPanelOpen: typeof open === 'function' ? open(prev) : open })
    },
    setLayersPanelOpen: (open) => {
        const prev = get().layersPanelOpen
        set({ layersPanelOpen: typeof open === 'function' ? open(prev) : open })
    },
    // A colour picked again moves to the front rather than appearing twice.
    addRecentColor: (color) => {
        const recent = color.toLowerCase()
        const others = get().recentColors.filter(c => c !== recent)
        set({ recentColors: [recent, ...others].slice(0, MAX_RECENT_COLORS) })
    },
})
