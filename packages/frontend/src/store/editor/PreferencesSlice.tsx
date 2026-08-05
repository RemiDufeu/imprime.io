import type { StateCreator } from 'zustand'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
export const DEFAULT_ZOOM = 1
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

export interface PreferencesSlice {
  zoom: number
  slidesPanelOpen: boolean
  layersPanelOpen: boolean
  setZoom: (zoom: number | ((prevZoom: number) => number)) => void
  setSlidesPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setLayersPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void
}

export const createPreferencesSlice: StateCreator<
  PreferencesSlice,
  [],
  [],
  PreferencesSlice
> = (set, get) => ({
    zoom: DEFAULT_ZOOM,
    slidesPanelOpen: false,
    layersPanelOpen: false,
    setZoom: (newZoom) => {
        const prevZoom = get().zoom
        const nextZoom = typeof newZoom === 'function' ? newZoom(prevZoom) : newZoom
        set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) })
    },
    setSlidesPanelOpen: (open) => {
        const prev = get().slidesPanelOpen
        set({ slidesPanelOpen: typeof open === 'function' ? open(prev) : open })
    },
    setLayersPanelOpen: (open) => {
        const prev = get().layersPanelOpen
        set({ layersPanelOpen: typeof open === 'function' ? open(prev) : open })
    },
})
