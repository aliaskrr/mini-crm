import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Breadcrumb, Button, Card, Popconfirm, Space } from 'antd'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useDeleteObject, useObject } from '../api/objects.ts'
import { useTasks } from '../api/tasks.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { FullPageSpin } from '../components/FullPageSpin.tsx'
import { NotFound } from '../components/NotFound.tsx'
import { ObjectFormModal } from '../components/ObjectFormModal.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { QueryError } from '../components/QueryError.tsx'
import { TaskFormModal } from '../components/TaskFormModal.tsx'
import { TaskSummary } from '../components/TaskSummary.tsx'
import { TaskTable } from '../components/TaskTable.tsx'
import { errorMessage } from '../lib/errors.ts'

export function ObjectPage() {
  const { objectId } = useParams()
  const { isManager } = useAuth()
  const object = useObject(objectId)
  const tasks = useTasks({ objectId })
  const deleteObject = useDeleteObject()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [editing, setEditing] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)

  if (object.isPending) return <FullPageSpin />
  if (object.error) return <QueryError error={object.error} onRetry={() => void object.refetch()} />
  if (!object.data) {
    return <NotFound title="Объект не найден" subTitle="Он удалён или у вас нет к нему доступа." />
  }

  const data = object.data
  const taskCount = tasks.data?.length ?? 0

  const remove = async () => {
    try {
      await deleteObject.mutateAsync(data.id)
      message.success('Объект удалён')
      navigate('/objects', { replace: true })
    } catch (error) {
      message.error(errorMessage(error))
    }
  }

  return (
    <>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/objects">{isManager ? 'Объекты' : 'Мои объекты'}</Link> }, { title: data.name }]}
      />
      <PageHeader
        title={data.name}
        subtitle={data.address}
        extra={
          isManager && (
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Изменить
              </Button>
              <Popconfirm
                title="Удалить объект?"
                description={
                  taskCount > 0
                    ? `Вместе с ним будут удалены его задачи (${taskCount}). История останется в базе.`
                    : 'Объект пропадёт из списков.'
                }
                okText="Удалить"
                okButtonProps={{ danger: true, loading: deleteObject.isPending }}
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

      <Card
        title={isManager ? 'Задачи объекта' : 'Ваши задачи на объекте'}
        extra={
          isManager ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatingTask(true)}>
              Добавить задачу
            </Button>
          ) : (
            tasks.data && <TaskSummary tasks={tasks.data} />
          )
        }
        styles={{ body: { padding: 0 } }}
      >
        {tasks.error && <QueryError error={tasks.error} onRetry={() => void tasks.refetch()} />}
        <TaskTable
          tasks={tasks.data}
          loading={tasks.isPending}
          showObject={false}
          showAssignee={isManager}
          emptyText="На объекте пока нет задач"
        />
      </Card>

      {editing && <ObjectFormModal object={data} onClose={() => setEditing(false)} />}
      {creatingTask && (
        <TaskFormModal
          defaultObjectId={data.id}
          onClose={() => setCreatingTask(false)}
          onSaved={(id) => navigate(`/tasks/${id}`)}
        />
      )}
    </>
  )
}
