import { Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router'
import type { TaskListItem } from '../api/tasks.ts'
import { formatDate } from '../lib/format.ts'
import { StatusTag } from './StatusTag.tsx'

type Props = {
  tasks: TaskListItem[] | undefined
  loading?: boolean
  showObject?: boolean
  showAssignee?: boolean
  emptyText?: string
}

export function TaskTable({ tasks, loading, showObject = true, showAssignee = true, emptyText }: Props) {
  const columns: ColumnsType<TaskListItem> = [
    {
      title: 'Задача',
      dataIndex: 'title',
      render: (title: string, task) => <Link to={`/tasks/${task.id}`}>{title}</Link>,
    },
  ]

  if (showObject) {
    columns.push({
      title: 'Объект',
      key: 'object',
      render: (_, task) =>
        task.object ? <Link to={`/objects/${task.object.id}`}>{task.object.name}</Link> : '—',
    })
  }

  columns.push({
    title: 'Статус',
    dataIndex: 'status',
    width: 150,
    render: (_, task) => <StatusTag status={task.status} />,
  })

  if (showAssignee) {
    columns.push({
      title: 'Исполнитель',
      key: 'assignee',
      render: (_, task) => task.assignee?.full_name ?? '—',
    })
  }

  columns.push({
    title: 'Создана',
    dataIndex: 'created_at',
    width: 140,
    render: (value: string) => <Typography.Text type="secondary">{formatDate(value)}</Typography.Text>,
  })

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={tasks}
      loading={loading}
      pagination={tasks && tasks.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: emptyText ?? 'Задач нет' }}
    />
  )
}
