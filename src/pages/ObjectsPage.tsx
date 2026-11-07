import { PlusOutlined } from '@ant-design/icons'
import { Button, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useObjects, type ObjectListItem } from '../api/objects.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { ObjectFormModal } from '../components/ObjectFormModal.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { QueryError } from '../components/QueryError.tsx'
import { TaskSummary } from '../components/TaskSummary.tsx'

export function ObjectsPage() {
  const { isManager } = useAuth()
  const objects = useObjects()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const columns: ColumnsType<ObjectListItem> = [
    {
      title: 'Объект',
      dataIndex: 'name',
      render: (name: string, object) => <Link to={`/objects/${object.id}`}>{name}</Link>,
    },
    {
      title: 'Адрес',
      dataIndex: 'address',
      render: (address: string) => <Typography.Text type="secondary">{address}</Typography.Text>,
    },
    {
      title: isManager ? 'Задачи' : 'Мои задачи',
      key: 'tasks',
      render: (_, object) => <TaskSummary tasks={object.tasks} />,
    },
  ]

  return (
    <>
      <PageHeader
        title={isManager ? 'Объекты' : 'Мои объекты'}
        subtitle={isManager ? 'Все стройки компании' : 'Объекты, на которых у вас есть задачи'}
        extra={
          isManager && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Добавить объект
            </Button>
          )
        }
      />

      {objects.error ? (
        <QueryError error={objects.error} onRetry={() => void objects.refetch()} />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={objects.data}
          loading={objects.isPending}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: isManager ? 'Объектов пока нет' : 'Вам пока не назначено ни одной задачи' }}
        />
      )}

      {creating && (
        <ObjectFormModal onClose={() => setCreating(false)} onSaved={(id) => navigate(`/objects/${id}`)} />
      )}
    </>
  )
}
