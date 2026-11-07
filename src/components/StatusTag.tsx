import { Tag } from 'antd'
import { STATUS_COLOR, STATUS_LABEL, type TaskStatus } from '../lib/labels.ts'

export function StatusTag({ status }: { status: TaskStatus }) {
  return (
    <Tag color={STATUS_COLOR[status]} style={{ marginInlineEnd: 0 }}>
      {STATUS_LABEL[status]}
    </Tag>
  )
}
