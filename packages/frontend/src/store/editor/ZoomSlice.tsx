import type { StateCreator } from 'zustand'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2
export const DEFAULT_ZOOM = 1
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

export interface ZoomSlice {
  zoom: number
  setZoom: (zoom: number | ((prevZoom: number) => number)) => void
}

export const createZoomSlice: StateCreator<
  ZoomSlice,
  [],
  [],
  ZoomSlice
> = (set, get) => ({
    zoom : DEFAULT_ZOOM,
    setZoom: (newZoom) => {
        const prevZoom = get().zoom
        const nextZoom = typeof newZoom === 'function' ? newZoom(prevZoom) : newZoom
        set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) })
    },
})