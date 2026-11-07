import { Empty, Flex, Skeleton, Timeline, Typography, theme } from 'antd'
import { useTaskHistory, type HistoryEntry } from '../api/tasks.ts'
import { formatDateTime } from '../lib/format.ts'
import type { TaskStatus } from '../lib/labels.ts'
import { QueryError } from './QueryError.tsx'
import { StatusTag } from './StatusTag.tsx'

const DOT_COLOR: Record<TaskStatus, string> = {
  new: '#1677ff',
  in_progress: '#faad14',
  review: '#722ed1',
  accepted: '#52c41a',
  rework: '#ff4d4f',
}

/** История статусов: кто, когда, из какого статуса в какой, комментарий. */
export function TaskHistory({ taskId }: { taskId: string }) {
  const history = useTaskHistory(taskId)

  if (history.isPending) return <Skeleton active />
  if (history.error) return <QueryError error={history.error} onRetry={() => void history.refetch()} />
  if (history.data.length === 0) return <Empty description="Записей пока нет" />

  return (
    <Timeline
      items={history.data.map((entry) => ({
        key: entry.id,
        color: DOT_COLOR[entry.to_status],
        content: <HistoryItem entry={entry} />,
      }))}
    />
  )
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const { token } = theme.useToken()
  // Профиль прежнего исполнителя (после переназначения задачи) текущему исполнителю не виден.
  const actor = entry.actor?.full_name ?? 'Предыдущий исполнитель'

  return (
    <Flex vertical gap={4}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {formatDateTime(entry.created_at)}
      </Typography.Text>
      <Flex align="center" gap={6} wrap>
        <Typography.Text strong>{actor}</Typography.Text>
        {entry.from_status ? (
          <>
            <StatusTag status={entry.from_status} />
            <span>→</span>
            <StatusTag status={entry.to_status} />
          </>
        ) : (
          <>
            <span>создал(а) задачу</span>
            <StatusTag status={entry.to_status} />
          </>
        )}
      </Flex>
      {entry.comment && (
        <Typography.Paragraph
          style={{
            margin: 0,
            padding: '6px 10px',
            whiteSpace: 'pre-wrap',
            background: token.colorFillTertiary,
            borderRadius: token.borderRadius,
          }}
        >
          {entry.comment}
        </Typography.Paragraph>
      )}
    </Flex>
  )
}
