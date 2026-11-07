import { Flex, Tag, Typography } from 'antd'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, type TaskStatus } from '../lib/labels.ts'

/** Сводка по статусам: «В работе: 2», «На проверке: 1»… */
export function TaskSummary({ tasks }: { tasks: { status: TaskStatus }[] }) {
  if (tasks.length === 0) return <Typography.Text type="secondary">Нет задач</Typography.Text>

  const counts = new Map<TaskStatus, number>()
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1)

  return (
    <Flex gap={4} wrap>
      {STATUS_ORDER.filter((status) => counts.has(status)).map((status) => (
        <Tag key={status} color={STATUS_COLOR[status]} style={{ marginInlineEnd: 0 }}>
          {STATUS_LABEL[status]}: {counts.get(status)}
        </Tag>
      ))}
    </Flex>
  )
}
