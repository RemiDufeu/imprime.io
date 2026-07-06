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
  // Clé en clair, affichée une seule fois juste après création.
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  async function loadKeys() {
    setLoading(true)
    const { data, error } = await authClient.apiKey.list()
    if (error) message.error("Impossible de charger les clés d'API")
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
      message.error("Création de la clé impossible")
      return
    }
    setRevealedKey(data.key)
    setModalOpen(false)
    setNewKeyName('')
    void loadKeys()
  }

  async function handleDelete(keyId: string) {
    const { error } = await authClient.apiKey.delete({ keyId })
    if (error) message.error('Révocation impossible')
    else {
      message.success('Clé révoquée')
      void loadKeys()
    }
  }

  return (
    <RegularPageContainer>
      <Card
        title="Clés d'API"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Nouvelle clé
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Utilisez une clé d'API pour accéder à l'API en dehors du navigateur
          (en-tête <code>x-api-key</code>).
        </Typography.Paragraph>

        {revealedKey && (
          <Alert
            style={{ marginBottom: 16 }}
            type="success"
            showIcon
            message="Copiez votre clé maintenant — elle ne sera plus affichée"
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
          locale={{ emptyText: 'Aucune clé' }}
          renderItem={(key) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="del"
                  title="Révoquer cette clé ?"
                  onConfirm={() => handleDelete(key.id)}
                  okText="Révoquer"
                  cancelText="Annuler"
                >
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={key.name || '(sans nom)'}
                description={`${key.start ?? '••••'}…  ·  créée le ${new Date(key.createdAt).toLocaleDateString()}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title="Nouvelle clé d'API"
        open={modalOpen}
        onOk={handleCreate}
        confirmLoading={creating}
        onCancel={() => setModalOpen(false)}
        okText="Créer"
        cancelText="Annuler"
      >
        <Input
          placeholder="Nom (optionnel, ex. « CLI perso »)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          onPressEnter={handleCreate}
        />
      </Modal>
    </RegularPageContainer>
  )
}
