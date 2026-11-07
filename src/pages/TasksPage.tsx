import { Segmented } from 'antd'
import { useSearchParams } from 'react-router'
import { useTasks } from '../api/tasks.ts'
import { useAuth, useCurrentProfile } from '../auth/AuthContext.ts'
import { PageHeader } from '../components/PageHeader.tsx'
import { QueryError } from '../components/QueryError.tsx'
import { TaskTable } from '../components/TaskTable.tsx'
import { STATUS_LABEL, STATUS_ORDER, type TaskStatus } from '../lib/labels.ts'

type Filter = TaskStatus | 'all'

/** «Мои задачи» у исполнителя, «Все задачи» у постановщика. Фильтр по статусу хранится в URL. */
export function TasksPage() {
  const { isManager } = useAuth()
  const profile = useCurrentProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  // Для исполнителя база и так вернёт только его задачи; фильтр по исполнителю — для наглядности.
  const tasks = useTasks(isManager ? {} : { assigneeId: profile.id })

  const statusParam = searchParams.get('status')
  const filter: Filter = STATUS_ORDER.includes(statusParam as TaskStatus) ? (statusParam as TaskStatus) : 'all'

  const counts = new Map<TaskStatus, number>()
  for (const task of tasks.data ?? []) counts.set(task.status, (counts.get(task.status) ?? 0) + 1)
  const visible = filter === 'all' ? tasks.data : tasks.data?.filter((task) => task.status === filter)

  const setFilter = (value: Filter) => {
    setSearchParams(value === 'all' ? {} : { status: value }, { replace: true })
  }

  return (
    <>
      <PageHeader
        title={isManager ? 'Все задачи' : 'Мои задачи'}
        subtitle={isManager ? 'Задачи по всем объектам' : 'Задачи, назначенные вам'}
      />

      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Все (${tasks.data?.length ?? 0})` },
            ...STATUS_ORDER.map((status) => ({
              value: status,
              label: `${STATUS_LABEL[status]} (${counts.get(status) ?? 0})`,
            })),
          ]}
        />
      </div>

      {tasks.error && <QueryError error={tasks.error} onRetry={() => void tasks.refetch()} />}

      <TaskTable
        tasks={visible}
        loading={tasks.isPending}
        showAssignee={isManager}
        emptyText={filter === 'all' ? 'Задач пока нет' : 'Нет задач в этом статусе'}
      />
    </>
  )
}
