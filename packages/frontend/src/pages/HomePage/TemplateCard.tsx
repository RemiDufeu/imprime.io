import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { TemplateSummary } from "@imprime/sdk";
import { findPageFormat } from "@imprime/sdk";
import { Button, Card } from "antd"

export default function TemplateCard({ template, onDeleteClicked, onDetailClick}: { template: TemplateSummary; onDeleteClicked: () => void; onDetailClick: () => void }) {
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
              <Card.Meta
                title={template.title}
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
            </Card>)
}