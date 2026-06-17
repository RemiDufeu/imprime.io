import type { CustomRenderElementProps } from "./TextBoxEditor";
import type { VariableElement } from "@imprime/sdk";
import { useEditorStore } from "../../store/editor/EditorStore";
import { theme } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';

type VariableBlockProps = CustomRenderElementProps & {
  element: VariableElement;
};

export const VariableBlock = ({ attributes, children, element } : VariableBlockProps) => {
  const { token } = theme.useToken();
  const presentation = useEditorStore(state => state.presentation);

  const variable = presentation?.variableData?.find(v => v._id === element.variableId);
  const variableName = variable?.name || 'Unknown Variable';

  const textStyle: React.CSSProperties = {};
  if (element.bold) textStyle.fontWeight = 'bold';
  if (element.italic) textStyle.fontStyle = 'italic';
  if (element.underline) textStyle.textDecoration = 'underline';
  if (element.fontFamily) textStyle.fontFamily = element.fontFamily;
  if (element.fontSize) textStyle.fontSize = element.fontSize;
  if (element.color) textStyle.color = element.color;

  const containerStyle: React.CSSProperties = {
    display: 'inline-block',
    position: 'relative',
    padding: '0 4px',
    border: `3px solid ${token.colorPrimary}`,
    borderRadius: '4px',
    ...textStyle,
  };

  const iconStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-12px',
    right: '-12px',
    fontSize: '1.75rem',
    color: token.colorPrimary,
    backgroundColor: token.colorBgContainer,
    borderRadius: '4px',
  };

  return (
    <span style={{
      padding : '0 4px'
    }}>
      <span {...attributes} contentEditable={false} style={containerStyle}>
        <ThunderboltFilled style={iconStyle} />
        {variableName}
        {children}
      </span>
    </span>
  );
};
