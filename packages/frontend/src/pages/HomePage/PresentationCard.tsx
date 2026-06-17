import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { PresentationSummary } from "@imprime/sdk";
import { Button, Card } from "antd"

export default function PresentationCard({ presentation, onDeleteClicked, onDetailClick}: { presentation: PresentationSummary; onDeleteClicked: () => void; onDetailClick: () => void }) {

    return (<Card
              key={presentation._id}
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
                title={presentation.title}
                description={
                  presentation.updatedAt && (
                    <div>
                      Updated on {new Date(presentation.updatedAt).toLocaleDateString('en-US')}
                    </div>
                  )
                }
              />
            </Card>)
}