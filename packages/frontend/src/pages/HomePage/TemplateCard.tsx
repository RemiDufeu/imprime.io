import { DeleteOutlined, EditOutlined, ExportOutlined } from "@ant-design/icons";
import type { TemplateSummary } from "@imprime/sdk";
import { findPageFormat } from "@imprime/sdk";
import { Button, Card, Tag, Tooltip } from "antd"
import "./TemplateCard.css"

export default function TemplateCard({ template, onDeleteClicked, onDetailClick, onExportClicked }: { template: TemplateSummary; onDeleteClicked: () => void; onDetailClick: () => void; onExportClicked: () => void }) {
    const { width, height } = template.pageSize
    const format = findPageFormat(template.pageSize)?.label ?? 'Custom'

    return (<Card
              key={template._id}
              hoverable
              style={{ borderRadius: '8px' }}
              onClick={() => {
                onDetailClick()
            }}
              actions={[
                <Button
                  key="edit"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDetailClick()
                  }}
                >
                  Edit
                </Button>,
                <Button
                  key="delete"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteClicked()
                  }}
                >
                  Delete
                </Button>,
              ]}
            >
              {/* Top right of the tile, out of the actions: a secondary one. */}
              <div className="template-card-body">
                <Card.Meta
                  className="template-card-meta"
                  title={<>{template.title} {template.code && <Tag>{template.code}</Tag>}</>}
                  description={
                    <>
                      <div>{format} · {width} × {height}</div>
                      {template.updatedAt && (
                        <div>
                          Updated on {new Date(template.updatedAt).toLocaleDateString('en-US')}
                        </div>
                      )}
                    </>
                  }
                />
                <Tooltip title="Export as a file">
                  <Button
                    type="text"
                    size="small"
                    icon={<ExportOutlined />}
                    aria-label="Export as a file"
                    onClick={(e) => {
                      e.stopPropagation()
                      onExportClicked()
                    }}
                  />
                </Tooltip>
              </div>
            </Card>)
}