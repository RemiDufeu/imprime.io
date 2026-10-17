import { ApiOutlined } from "@ant-design/icons";
import { App, Input } from "antd";
import { useState } from "react";
import { isValidTemplateCode, TEMPLATE_CODE_MAX_LENGTH } from "@imprime/sdk";
import { useEditorStore } from "../../store/editor/EditorStore";
import { parseApiError } from "../../utils/apiError";

// The open template's code, next to its title. Saved on Enter or on leaving
// the field — not as it is typed, when a code half written is refused, or
// taken; Escape goes back to the saved one. Keyed by the template, so that a
// draft never carries over to another.
export default function TemplateCodeInput() {
    const { message } = App.useApp();
    const template = useEditorStore(state => state.template);
    const updateTemplateCode = useEditorStore(state => state.updateTemplateCode);
    // Null while the field shows the saved code.
    const [draft, setDraft] = useState<string | null>(null);
    // The API refused the draft: taken by another template.
    const [isRefused, setIsRefused] = useState(false);

    if (!template) return null;

    const saved = template.code ?? '';
    const value = (draft ?? saved).trim();
    const isInvalid = value !== '' && !isValidTemplateCode(value);

    const save = async () => {
        if (draft === null || value === saved) {
            setDraft(null);
            return;
        }
        if (isInvalid) {
            message.error(`A code is letters, digits, "-" and "_", ${TEMPLATE_CODE_MAX_LENGTH} at most`);
            return;
        }
        try {
            await updateTemplateCode(value === '' ? null : value);
            setDraft(null);
        } catch (error) {
            // A code another template has is the author's to fix; the rest
            // is not theirs to read.
            const apiError = parseApiError(error);
            setIsRefused(true);
            message.error(
                apiError.code === 'TEMPLATE_CODE_TAKEN' || apiError.code === 'INVALID_TEMPLATE_CODE'
                    ? apiError.message
                    : 'Failed to save the code'
            );
        }
    };

    return (
        <Input
            value={draft ?? saved}
            onChange={(e) => {
                setDraft(e.target.value);
                setIsRefused(false);
            }}
            onPressEnter={(e) => e.currentTarget.blur()}
            onBlur={save}
            onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                setDraft(null);
                setIsRefused(false);
            }}
            placeholder="Code"
            maxLength={TEMPLATE_CODE_MAX_LENGTH}
            status={isInvalid || isRefused ? 'error' : undefined}
            prefix={<ApiOutlined />}
            size="large"
            className="code-input"
            aria-label="Template code"
        />
    );
}
