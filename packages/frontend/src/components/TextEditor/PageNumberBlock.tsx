import type { RenderElementProps } from "slate-react";
import type { PageNumberElement } from "@imprime/sdk";
import { NumberOutlined } from '@ant-design/icons';
import { InlineChip } from "./InlineChip";
import { PAGE_NUMBER_LABELS } from "./pageNumberLabels";

type PageNumberBlockProps = Omit<RenderElementProps, 'element'> & {
  element: PageNumberElement;
};

// Named, not numbered: the number is the PDF's, once its pages are counted.
export const PageNumberBlock = ({ attributes, children, element }: PageNumberBlockProps) => (
  <InlineChip attributes={attributes} element={element} label={PAGE_NUMBER_LABELS[element.kind]} Icon={NumberOutlined}>
    {children}
  </InlineChip>
);
