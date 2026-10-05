import { DownloadOutlined, LeftOutlined, RedoOutlined, ThunderboltFilled, UndoOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react";
import { templatesAPI } from "../../api/api";
import { Button, Input, message, Modal, Form, Switch, Dropdown, Space, Tooltip } from "antd";
import type { VariableValueType } from "@imprime/sdk";
import "./EditorHeader.css";
import { useEditorStore } from "../../store/editor/EditorStore";
import { MOD_LABEL } from "../../utils/hotkeys";
import { selectCanRedo, selectCanUndo } from "../../store/editor/selectors";
import { ItemListInput } from "../../components/common";
import { DropdownVariablesContent } from "../EditorPage/components/PageEditor/TopBar/Context-toolbar/DropdownVariablesContent/DropdownVariablesContent";
import { VariableFormModal } from "../EditorPage/components/PageEditor/TopBar/Context-toolbar/DropdownVariablesContent/VariableFormModal";

export default function EditorHeader() {
    const navigate = useNavigate();
    const template = useEditorStore(state => state.template);
    const updateTemplateTitle = useEditorStore(state => state.updateTemplateTitle);
    const undo = useEditorStore(state => state.undo);
    const redo = useEditorStore(state => state.redo);
    const canUndo = useEditorStore(selectCanUndo);
    const canRedo = useEditorStore(selectCanRedo);
    const [localTitle, setLocalTitle] = useState(template?.title ?? '');
    const [isExporting, setIsExporting] = useState(false);
    const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
    const [form] = Form.useForm();

    // In the store rather than here: opening the edit form has to close this
    // panel, and the panel itself is what triggers it.
    const isVariablesDropdownOpen = useEditorStore(state => state.variablesPanelOpen);
    const setVariablesPanelOpen = useEditorStore(state => state.setVariablesPanelOpen);

    useEffect(() => {
        if (template?.title !== undefined) {
            setLocalTitle(template.title);
        }
    }, [template?.title]);

    useEffect(() => {
        if (!template) return;

        if (localTitle === template.title) return;

        const timeoutId = setTimeout(() => {
            if (localTitle.trim()) {
                updateTemplateTitle(localTitle);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [localTitle, template, updateTemplateTitle]);

    const handleDownloadClick = () => {
        if (!template) {
            message.warning('No template loaded');
            return;
        }

        const hasVariables = template.variableData && template.variableData.length > 0;

        if (hasVariables) {
            setIsVariableModalOpen(true);
            const initialValues: Record<string, VariableValueType> = {};
            template.variableData?.forEach(variable => {
                if (variable.default !== undefined && variable.default !== null) {
                    initialValues[variable.name] = variable.default;
                }
            });
            form.setFieldsValue(initialValues);
        } else {
            // No variables, download directly
            handleDownloadPDF({});
        }
    };

    const handleDownloadPDF = async (variableValues: Record<string, VariableValueType>) => {
        if (!template) return;

        setIsExporting(true);
        try {
            await templatesAPI.downloadPDF(
                template._id,
                `${template.title || 'template'}.pdf`,
                variableValues
            );
            message.success('PDF exported successfully!');
            setIsVariableModalOpen(false);
            form.resetFields();
        } catch (error) {
            console.error('Export error:', error);
            if (error instanceof Error && error.message.includes('Required variable')) {
                message.error(error.message);
            } else {
                message.error('Failed to export PDF. Please try again.');
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleVariableFormSubmit = async () => {
        try {
            const values = await form.validateFields();
            await handleDownloadPDF(values);
        } catch (error) {
            console.error('Form validation error:', error);
        }
    };

    return (
    <>
    <div className="header-container">
        <div className="gap-header">
            <Button
                onClick={() => navigate('/')}
                size="large"
                icon={<LeftOutlined/>}
            />
            <Input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                placeholder="Template title"
                size="large"
                className="inputBtn"/>
            <Space>
                <Tooltip title={`Undo (${MOD_LABEL}+Z)`}>
                    <Button size="large" icon={<UndoOutlined />} disabled={!canUndo} onClick={undo} />
                </Tooltip>
                <Tooltip title={`Redo (${MOD_LABEL}+Shift+Z)`}>
                    <Button size="large" icon={<RedoOutlined />} disabled={!canRedo} onClick={redo} />
                </Tooltip>
            </Space>
        </div>
        <div className="gap-header">
            <Dropdown
                menu={{ items: [] }}
                popupRender={() => <DropdownVariablesContent />}
                destroyOnHidden
                trigger={["click"]}
                placement="bottomRight"
                open={isVariablesDropdownOpen}
                onOpenChange={setVariablesPanelOpen}>
                <Button
                    size="large"
                    icon={<ThunderboltFilled />}>
                    Variables
                </Button>
            </Dropdown>
            <Button
                onClick={handleDownloadClick}
                color="primary"
                size="large"
                loading={isExporting}
                icon={<DownloadOutlined/>}>
                Imprime
            </Button>
        </div>
    </div>

    <Modal
        title="Variable Values"
        open={isVariableModalOpen}
        onOk={handleVariableFormSubmit}
        onCancel={() => {
            setIsVariableModalOpen(false);
            form.resetFields();
        }}
        okText="Export PDF"
        cancelText="Cancel"
        confirmLoading={isExporting}
    >
        <Form
            form={form}
            layout="vertical"
        >
            {template?.variableData?.map(variable => {
                const defaultHint = variable.default !== undefined && variable.default !== null
                    ? `Default: ${Array.isArray(variable.default) ? `${variable.default.length} items` : String(variable.default)}`
                    : 'None';

                let input: React.ReactNode;
                let valuePropName: string | undefined;
                if (variable.type === 'boolean') {
                    input = <Switch />;
                    valuePropName = 'checked';
                } else if (variable.type === 'object-list') {
                    input = <ItemListInput itemFields={variable.itemFields} />;
                } else {
                    input = <Input placeholder={typeof variable.default === 'string' ? variable.default : `Enter ${variable.name}`} />;
                }

                return (
                    <Form.Item
                        key={variable._id}
                        label={variable.name}
                        name={variable.name}
                        valuePropName={valuePropName}
                        rules={[
                            {
                                required: variable.required,
                                message: `${variable.name} is required`
                            }
                        ]}
                        tooltip={variable.required ? 'Required' : defaultHint}
                    >
                        {input}
                    </Form.Item>
                );
            })}
        </Form>
    </Modal>

    <VariableFormModal />
    </>
    )
}