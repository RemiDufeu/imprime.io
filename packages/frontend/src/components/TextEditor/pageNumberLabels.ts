import type { PageNumberKind } from "@imprime/sdk";

// How the editor names each page number, on its chip and in the insert menu.
export const PAGE_NUMBER_LABELS: Record<PageNumberKind, string> = {
  current: 'Page number',
  total: 'Page count',
};
