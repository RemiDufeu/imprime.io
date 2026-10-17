import { Button, Dropdown, Tooltip, type MenuProps } from "antd";
import { EllipsisOutlined, EyeOutlined, RetweetOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { Page } from "@imprime/sdk";
import { useEditorStore } from "../../../../../../store/editor/EditorStore";
import type { PagePreview } from "../../../../../../utils/conditionPreview";
import { variableReferenceLabel } from "../../../../../../utils/variableScope";
import { usePageBindingMenus } from "../../usePageBindingMenus";

// The thumbnail's menu: the page's repeat and condition, one submenu each, as
// its context bar sets them.
export function PageBindingsMenu({ page }: { page: Page }) {
    const { condition, repeat, select } = usePageBindingMenus(page);

    const items: MenuProps["items"] = [
        { key: "repeat", icon: <RetweetOutlined />, label: "Repeat", children: repeat.items },
        { key: "show", icon: <EyeOutlined />, label: "Show", children: condition.items },
    ];

    // Neither the button nor the menu, rendered in a portal but still a React
    // child of the thumbnail, may reach the thumbnail's click.
    return (
        <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
                items,
                selectable: true,
                selectedKeys: [...repeat.selectedKeys, ...condition.selectedKeys],
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    select(key);
                },
                style: { maxHeight: 320, overflowY: "auto" },
            }}
        >
            <Button
                type="text"
                size="small"
                icon={<EllipsisOutlined />}
                className="page-thumbnail-menu"
                aria-label="Page repeat and condition"
                onClick={(e) => e.stopPropagation()}
            />
        </Dropdown>
    );
}

// What the data does to the page — exported once per item, exported on a
// condition — each with the icon of its control.
export function PageBindingBadges({ page, preview }: { page: Page; preview: PagePreview }) {
    const variables = useEditorStore(state => state.template?.variableData) ?? [];

    const badges: { key: string; icon: ReactNode; label: string; title: string; tone: string }[] = [];
    if (page.repeat) {
        const { variableId } = page.repeat;
        const list = variableId ? variableReferenceLabel(variables, variableId, undefined) ?? "unknown list" : "no list";
        let title = variableId
            ? `Exported once per item of ${list}; the editor shows one copy`
            : "Repeated page without a list: the export has no copy of it";
        if (variableId && preview.repeat === "empty") title += " — none with the default values";
        badges.push({
            key: "repeat",
            icon: <RetweetOutlined />,
            label: list,
            title,
            tone: preview.repeat === "empty" ? "muted" : "repeat",
        });
    }
    if (page.visibleWhen) {
        const { variableId, itemPath, negate } = page.visibleWhen;
        const name = variableId ? variableReferenceLabel(variables, variableId, itemPath) ?? "unknown variable" : "no variable";
        let title = `Exported only when ${name} is ${negate ? "false" : "true"}`;
        // Checked copy by copy in the export; here on the copy the editor
        // shows, the first item.
        if (preview.condition === "hidden") {
            title += page.repeat ? " — not for the first default item" : " — left out with the default values";
        }
        if (preview.condition === "unknown") title += " — the list it reads has no default item to check";
        badges.push({
            key: "condition",
            icon: <EyeOutlined />,
            label: negate ? `not ${name}` : name,
            title,
            tone: preview.condition === "hidden" ? "muted" : "condition",
        });
    }

    if (badges.length === 0) return null;
    return (
        <div className="page-thumbnail-badges">
            {badges.map(badge => (
                <Tooltip key={badge.key} title={badge.title} mouseEnterDelay={0.4}>
                    <span className={`page-thumbnail-badge ${badge.tone}`}>
                        {badge.icon}
                        <span className="page-thumbnail-badge-label">{badge.label}</span>
                    </span>
                </Tooltip>
            ))}
        </div>
    );
}
