import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { App, Breadcrumb, Button, Card, Col, Descriptions, Flex, Popconfirm, Row, Space, Typography } from 'antd'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useDeleteTask, useTask } from '../api/tasks.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { FullPageSpin } from '../components/FullPageSpin.tsx'
import { NotFound } from '../components/NotFound.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { QueryError } from '../components/QueryError.tsx'
import { StatusTag } from '../components/StatusTag.tsx'
import { TaskActions } from '../components/TaskActions.tsx'
import { TaskFormModal } from '../components/TaskFormModal.tsx'
import { TaskHistory } from '../components/TaskHistory.tsx'
import { errorMessage } from '../lib/errors.ts'
import { formatDateTime } from '../lib/format.ts'
import { isUuid } from '../lib/text.ts'

export function TaskPage() {
  const { taskId } = useParams()
  const { isManager } = useAuth()
  // Заведомо неверный id из адреса (обрезанная ссылка) в базу не отправляем.
  const validId = isUuid(taskId) ? taskId : undefined
  const task = useTask(validId)
  const deleteTask = useDeleteTask()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [editing, setEditing] = useState(false)

  if (!validId) return <NotFound title="Задача не найдена" subTitle="Проверьте ссылку." />
  if (task.isPending) return <FullPageSpin />
  if (task.error) return <QueryError error={task.error} onRetry={() => void task.refetch()} />
  if (!task.data) {
    return <NotFound title="Задача не найдена" subTitle="Она удалена или назначена другому исполнителю." />
  }

  const data = task.data

  const remove = async () => {
    try {
      await deleteTask.mutateAsync(data.id)
      message.success('Задача удалена')
      navigate(data.object ? `/objects/${data.object.id}` : '/tasks', { replace: true })
    } catch (error) {
      message.error(errorMessage(error))
    }
  }

  return (
    <>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/objects">{isManager ? 'Объекты' : 'Мои объекты'}</Link> },
          ...(data.object ? [{ title: <Link to={`/objects/${data.object.id}`}>{data.object.name}</Link> }] : []),
          { title: data.title },
        ]}
      />
      <PageHeader
        title={
          <Flex align="center" gap={12} wrap>
            <span>{data.title}</span>
            <StatusTag status={data.status} />
          </Flex>
        }
        extra={
          isManager && (
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Изменить
              </Button>
              <Popconfirm
                title="Удалить задачу?"
                description="Она пропадёт из списков. История останется в базе."
                okText="Удалить"
                okButtonProps={{ danger: true, loading: deleteTask.isPending }}
                cancelText="Отмена"
                onConfirm={remove}
              >
                <Button danger icon={<DeleteOutlined />}>
                  Удалить
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Flex vertical gap={16}>
            <Card title="Действия">
              {/* key: при смене статуса блок действий монтируется заново и закрывает открытый диалог */}
              <TaskActions key={data.status} task={data} />
            </Card>
            <Card title="Данные задачи">
              <Descriptions
                column={1}
                styles={{ label: { width: 140 } }}
                items={[
                  {
                    key: 'object',
                    label: 'Объект',
                    children: data.object ? (
                      <Flex vertical>
                        <Link to={`/objects/${data.object.id}`}>{data.object.name}</Link>
                        <Typography.Text type="secondary">{data.object.address}</Typography.Text>
                      </Flex>
                    ) : (
                      '—'
                    ),
                  },
                  { key: 'assignee', label: 'Исполнитель', children: data.assignee?.full_name ?? '—' },
                  { key: 'author', label: 'Автор', children: data.author?.full_name ?? '—' },
                  { key: 'created', label: 'Создана', children: formatDateTime(data.created_at) },
                  {
                    key: 'description',
                    label: 'Описание',
                    children: data.description ? (
                      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                        {data.description}
                      </Typography.Paragraph>
                    ) : (
                      <Typography.Text type="secondary">Нет описания</Typography.Text>
                    ),
                  },
                ]}
              />
            </Card>
          </Flex>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="История">
            <TaskHistory taskId={data.id} />
          </Card>
        </Col>
      </Row>

      {editing && (
        <TaskFormModal
          task={{
            id: data.id,
            title: data.title,
            description: data.description,
            object_id: data.object_id,
            assignee_id: data.assignee_id,
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
