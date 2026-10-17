import type { RenderElementProps } from "slate-react";
import type { InlineElement } from "@imprime/sdk";
import { getRunTextStyle } from "@imprime/sdk";
import { useEditorStore } from "../../store/editor/EditorStore";
import { theme } from 'antd';

type InlineChipProps = Omit<RenderElementProps, 'element'> & {
  element: InlineElement;
  // What the chip names: the element, never what it will evaluate to — the
  // editor shows the authored tree.
  label: string;
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
};

// An inline element as the editor draws it: a framed chip in the element's
// own formatting, its icon on the corner.
export const InlineChip = ({ attributes, children, element, label, Icon }: InlineChipProps) => {
  const { token } = theme.useToken();
  const fontCatalog = useEditorStore(state => state.fontCatalog);

  const textStyle: React.CSSProperties = getRunTextStyle(element, fontCatalog);
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
        <Icon style={iconStyle} />
        {label}
        {children}
      </span>
    </span>
  );
};
