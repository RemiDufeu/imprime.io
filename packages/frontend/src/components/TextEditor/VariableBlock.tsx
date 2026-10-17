import type { CustomRenderElementProps } from "./TextBoxEditor";
import type { VariableElement } from "@imprime/sdk";
import { useEditorStore } from "../../store/editor/EditorStore";
import { ThunderboltFilled } from '@ant-design/icons';
import { InlineChip } from "./InlineChip";

type VariableBlockProps = CustomRenderElementProps & {
  element: VariableElement;
};

export const VariableBlock = ({ attributes, children, element } : VariableBlockProps) => {
  const template = useEditorStore(state => state.template);

  const variable = template?.variableData?.find(v => v._id === element.variableId);
  const variableName = variable?.name || 'Unknown Variable';
  // An item-scoped run names its field too, so 'pokemonList.name' is
  // distinguishable from 'pokemonList'.
  const label = element.itemPath ? `${variableName}.${element.itemPath}` : variableName;

  return (
    <InlineChip attributes={attributes} element={element} label={label} Icon={ThunderboltFilled}>
      {children}
    </InlineChip>
  );
};
