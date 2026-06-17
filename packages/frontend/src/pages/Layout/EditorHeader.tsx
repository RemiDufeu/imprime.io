import { DownloadOutlined, LeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react";
import { presentationsAPI } from "../../api/api";
import { Button, Input, message, Modal, Form } from "antd";
import "./EditorHeader.css";
import { useEditorStore } from "../../store/editor/EditorStore";

export default function EditorHeader() {
    const navigate = useNavigate();
    const presentation = useEditorStore(state => state.presentation);
    const updatePresentationTitle = useEditorStore(state => state.updatePresentationTitle);
    const [localTitle, setLocalTitle] = useState(presentation?.title ?? '');
    const [isExporting, setIsExporting] = useState(false);
    const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        if (presentation?.title !== undefined) {
            setLocalTitle(presentation.title);
        }
    }, [presentation?.title]);

    useEffect(() => {
        if (!presentation) return;

        if (localTitle === presentation.title) return;

        const timeoutId = setTimeout(() => {
            if (localTitle.trim()) {
                updatePresentationTitle(localTitle);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [localTitle, presentation, updatePresentationTitle]);

    const handleDownloadClick = () => {
        if (!presentation) {
            message.warning('No presentation loaded');
            return;
        }

        const hasVariables = presentation.variableData && presentation.variableData.length > 0;

        if (hasVariables) {
            setIsVariableModalOpen(true);
            const initialValues: Record<string, string> = {};
            presentation.variableData?.forEach(variable => {
                if (variable.default) {
                    initialValues[variable.name] = variable.default;
                }
            });
            form.setFieldsValue(initialValues);
        } else {
            // No variables, download directly
            handleDownloadPDF({});
        }
    };

    const handleDownloadPDF = async (variableValues: Record<string, string>) => {
        if (!presentation) return;

        setIsExporting(true);
        try {
            await presentationsAPI.downloadPDF(
                presentation._id,
                `${presentation.title || 'presentation'}.pdf`,
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
                placeholder="Presentation title"
                size="large"
                className="inputBtn"/>
        </div>
        <div className="gap-header">
            <Button
                onClick={handleDownloadClick}
                color="primary"
                size="large"
                loading={isExporting}
                icon={<DownloadOutlined/>}>
                Download
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
            {presentation?.variableData?.map(variable => (
                <Form.Item
                    key={variable._id}
                    label={variable.name}
                    name={variable.name}
                    rules={[
                        {
                            required: variable.required,
                            message: `${variable.name} is required`
                        }
                    ]}
                    tooltip={variable.required ? 'Required' : `Default: ${variable.default || 'None'}`}
                >
                    <Input
                        placeholder={variable.default || `Enter ${variable.name}`}
                    />
                </Form.Item>
            ))}
        </Form>
    </Modal>
    </>
    )
}