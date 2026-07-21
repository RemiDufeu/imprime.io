import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, Input, List, Modal, Popconfirm, Space, Typography, message,
} from 'antd'
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { authClient } from '../../auth/authClient'
import RegularPageContainer from '../../components/Layout/RegularPageContainer/RegularPageContainer'

interface ApiKeyItem {
  id: string
  name: string | null
  start: string | null
  createdAt: string | Date
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  // Plaintext key, shown only once right after creation.
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  async function loadKeys() {
    setLoading(true)
    const { data, error } = await authClient.apiKey.list()
    if (error) message.error('Failed to load API keys')
    else setKeys((data?.apiKeys ?? []) as unknown as ApiKeyItem[])
    setLoading(false)
  }

  useEffect(() => {
    void loadKeys()
  }, [])

  async function handleCreate() {
    setCreating(true)
    const { data, error } = await authClient.apiKey.create({ name: newKeyName || undefined })
    setCreating(false)
    if (error || !data) {
      message.error('Failed to create API key')
      return
    }
    setRevealedKey(data.key)
    setModalOpen(false)
    setNewKeyName('')
    void loadKeys()
  }

  async function handleDelete(keyId: string) {
    const { error } = await authClient.apiKey.delete({ keyId })
    if (error) message.error('Failed to revoke key')
    else {
      message.success('Key revoked')
      void loadKeys()
    }
  }

  return (
    <RegularPageContainer>
      <Card
        title="API Keys"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New key
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Use an API key to access the API outside the browser
          (<code>x-api-key</code> header).
        </Typography.Paragraph>

        {revealedKey && (
          <Alert
            style={{ marginBottom: 16 }}
            type="success"
            showIcon
            message="Copy your key now — it won't be shown again"
            description={
              <Space>
                <Typography.Text code copyable={{ icon: <CopyOutlined /> }}>
                  {revealedKey}
                </Typography.Text>
              </Space>
            }
            closable
            onClose={() => setRevealedKey(null)}
          />
        )}

        <List
          loading={loading}
          dataSource={keys}
          locale={{ emptyText: 'No keys' }}
          renderItem={(key) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="del"
                  title="Revoke this key?"
                  onConfirm={() => handleDelete(key.id)}
                  okText="Revoke"
                  cancelText="Cancel"
                >
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={key.name || '(unnamed)'}
                description={`${key.start ?? '••••'}…  ·  created ${new Date(key.createdAt).toLocaleDateString()}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title="New API key"
        open={modalOpen}
        onOk={handleCreate}
        confirmLoading={creating}
        onCancel={() => setModalOpen(false)}
        okText="Create"
        cancelText="Cancel"
      >
        <Input
          placeholder="Name (optional, e.g. “Personal CLI”)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          onPressEnter={handleCreate}
        />
      </Modal>
    </RegularPageContainer>
  )
}
