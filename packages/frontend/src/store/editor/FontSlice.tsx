import { createFontCatalog, importedFontFamilyName, isContainerShape } from '@imprime/sdk'
import type { FontCatalog, FontDTO, Presentation, Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import { fontsAPI } from '../../api/api'
import { registerImportedFont } from '../../fonts'
import type { PresentationSlice } from './PresentationSlice'

export interface FontSlice {
    // The instance's imported fonts that are ready to draw with.
    importedFonts: FontDTO.Response[]
    // What every run in the editor resolves its face against.
    fontCatalog: FontCatalog

    // Lists the instance's fonts and loads the ones the open presentation
    // uses: each face is a download of up to a few megabytes, and most fonts
    // of an instance appear in no given presentation.
    loadFonts: () => Promise<void>
    // Loads every imported font: the font picker previews each in itself.
    loadAllFonts: () => Promise<void>
}

// Families the text of `presentation` is set in, containers included.
function usedFamilies(presentation: Presentation | null): Set<string> {
    const families = new Set<string>()
    const visit = (shapes: Shape[]) => {
        for (const shape of shapes) {
            if (shape.type === 'text') {
                for (const paragraph of shape.paragraphes) {
                    for (const run of paragraph.children) {
                        if (run.fontFamily) families.add(run.fontFamily)
                    }
                }
            } else if (isContainerShape(shape)) {
                visit(shape.children)
            }
        }
    }
    for (const slide of presentation?.slides ?? []) visit(slide.shapes)
    return families
}

export const createFontSlice: StateCreator<
    FontSlice & PresentationSlice,
    [],
    [],
    FontSlice
> = (set, get) => {
    // The instance's fonts as last listed.
    let listed: FontDTO.Response[] = []

    const list = async () => {
        listed = await fontsAPI.list()
    }

    // Adds `fonts` to the catalog once their faces are in the document: until
    // then their text is drawn in the default font rather than in whatever
    // the browser falls back to. Fonts no longer listed, or listed under a
    // newer version, leave it.
    const load = async (fonts: FontDTO.Response[]) => {
        const loads = await Promise.allSettled(fonts.map(registerImportedFont))
        loads.forEach((load, index) => {
            if (load.status === 'rejected') {
                console.error(`Failed to load font "${fonts[index].family}":`, load.reason)
            }
        })

        const current = new Set(listed.map(importedFontFamilyName))
        const ready = [
            ...get().importedFonts,
            ...fonts.filter((_, index) => loads[index].status === 'fulfilled'),
        ].filter((font, index, all) => {
            const name = importedFontFamilyName(font)
            return current.has(name) && all.findIndex(other => importedFontFamilyName(other) === name) === index
        })

        // A new catalog re-renders every text box: only when it changes.
        const before = get().importedFonts.map(importedFontFamilyName).sort().join()
        if (ready.map(importedFontFamilyName).sort().join() !== before) {
            set({ importedFonts: ready, fontCatalog: createFontCatalog(ready) })
        }
    }

    return {
        importedFonts: [],
        fontCatalog: createFontCatalog(),

        loadFonts: async () => {
            try {
                await list()
                const used = usedFamilies(get().presentation)
                await load(listed.filter(font => used.has(font.family)))
            } catch (error) {
                console.error('Failed to load fonts:', error)
            }
        },

        loadAllFonts: async () => {
            try {
                // Listed again: picks up fonts an admin imported since.
                await list()
                await load(listed)
            } catch (error) {
                console.error('Failed to load fonts:', error)
            }
        },
    }
}
