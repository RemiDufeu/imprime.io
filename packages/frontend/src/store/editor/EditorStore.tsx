import { create } from "zustand"
import { persist, subscribeWithSelector } from "zustand/middleware"
import { createTemplateSlice, type TemplateSlice } from "./TemplateSlice"
import { createPageSlice, type PageSlice } from "./PageSlice"
import { createDocumentWriteSlice, type DocumentWriteSlice } from "./DocumentWriteSlice"
import { createSelectionSlice, type SelectionSlice } from "./SelectionSlice"
import { createShapeSlice, type ShapeSlice } from "./ShapeSlice"
import { createClipboardSlice, type ClipboardSlice } from "./ClipboardSlice"
import { createToolSlice, type ToolSlice } from "./ToolSlice"
import { createTransformationSlice, type TransformationSlice } from "./TransformationSlice"
import { createTextEditorSlice, type TextEditorSlice } from "./TextEditorSlice"
import { createHistorySlice, type HistorySlice } from "./HistorySlice"
import { createImportSlice, type ImportSlice } from "./ImportSlice"
import { createVariableSlice, type VariableSlice } from "./VariableSlice"
import { createFontSlice, type FontSlice } from "./FontSlice"
import { createPreferencesSlice, type PreferencesSlice } from "./PreferencesSlice"
import { selectCurrentPage } from "./selectors"

type BaseEditorStore = TemplateSlice &
    PageSlice &
    DocumentWriteSlice &
    SelectionSlice &
    ShapeSlice &
    ClipboardSlice &
    ToolSlice &
    TransformationSlice &
    TextEditorSlice &
    HistorySlice &
    ImportSlice &
    VariableSlice &
    FontSlice &
    PreferencesSlice

export const useEditorStore = create<BaseEditorStore>()(
    subscribeWithSelector(
        persist(
            (...args) => ({
                ...createTemplateSlice(...args),
                ...createPageSlice(...args),
                ...createDocumentWriteSlice(...args),
                ...createSelectionSlice(...args),
                ...createShapeSlice(...args),
                ...createClipboardSlice(...args),
                ...createToolSlice(...args),
                ...createTransformationSlice(...args),
                ...createTextEditorSlice(...args),
                ...createHistorySlice(...args),
                ...createImportSlice(...args),
                ...createVariableSlice(...args),
                ...createFontSlice(...args),
                ...createPreferencesSlice(...args),
            }),
            {
                name: 'editor-store',
                partialize: (state) => ({
                    zoom: state.zoom,
                    pagesPanelOpen: state.pagesPanelOpen,
                    layersPanelOpen: state.layersPanelOpen,
                }),
            }
        ),
    ),
)

export const useCurrentPage = () => useEditorStore(selectCurrentPage);
