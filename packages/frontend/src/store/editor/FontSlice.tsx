import { createFontCatalog } from '@imprime/sdk'
import type { FontCatalog, FontDTO } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import { fontsAPI } from '../../api/api'
import { registerImportedFont } from '../../fonts'

export interface FontSlice {
    // The instance's imported fonts that are ready to draw with.
    importedFonts: FontDTO.Response[]
    // What every run in the editor resolves its face against.
    fontCatalog: FontCatalog

    loadFonts: () => Promise<void>
}

export const createFontSlice: StateCreator<
    FontSlice,
    [],
    [],
    FontSlice
> = (set) => ({
    importedFonts: [],
    fontCatalog: createFontCatalog(),

    loadFonts: async () => {
        try {
            const fonts = await fontsAPI.list()

            // A font enters the catalog only once its faces are in the
            // document: until then its text is drawn in the default font
            // rather than in whatever the browser falls back to.
            const loads = await Promise.allSettled(fonts.map(registerImportedFont))
            const ready = fonts.filter((font, index) => {
                const load = loads[index]
                if (load.status === 'rejected') {
                    console.error(`Failed to load font "${font.family}":`, load.reason)
                }
                return load.status === 'fulfilled'
            })

            set({ importedFonts: ready, fontCatalog: createFontCatalog(ready) })
        } catch (error) {
            console.error('Failed to load fonts:', error)
        }
    },
})
