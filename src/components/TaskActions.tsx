import { CheckOutlined, PlayCircleOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons'
import { App, Button, Flex, Form, Input, Modal, Skeleton, Space, Typography } from 'antd'
import { useState, type ReactNode } from 'react'
import { useChangeTaskStatus, useAvailableTransitions } from '../api/tasks.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { errorMessage } from '../lib/errors.ts'
import { ACTION_LABEL, STATUS_LABEL, type TaskStatus } from '../lib/labels.ts'
import { QueryError } from './QueryError.tsx'
import { StatusTag } from './StatusTag.tsx'

type Transition = { to_status: TaskStatus; comment_required: boolean }

const ACTION_ICON: Partial<Record<TaskStatus, ReactNode>> = {
  in_progress: <PlayCircleOutlined />,
  review: <SendOutlined />,
  accepted: <CheckOutlined />,
  rework: <RollbackOutlined />,
}

/**
 * Кнопки смены статуса. Список доступных действий приходит из базы
 * (get_available_transitions), поэтому интерфейс показывает ровно то,
 * что база разрешит сделать текущему пользователю в текущем статусе.
 */
export function TaskActions({ task }: { task: { id: string; status: TaskStatus } }) {
  const { isManager } = useAuth()
  const transitions = useAvailableTransitions(task.id, task.status)
  const [selected, setSelected] = useState<Transition | null>(null)

  if (transitions.isPending) return <Skeleton.Button active />
  if (transitions.error) {
    return <QueryError error={transitions.error} onRetry={() => void transitions.refetch()} />
  }
  if (transitions.data.length === 0) {
    return <Typography.Text type="secondary">{idleHint(task.status, isManager)}</Typography.Text>
  }

  return (
    <>
      <Space wrap>
        {transitions.data.map((transition) => (
          <Button
            key={transition.to_status}
            type={transition.to_status === 'rework' ? 'default' : 'primary'}
            danger={transition.to_status === 'rework'}
            icon={ACTION_ICON[transition.to_status]}
            onClick={() => setSelected(transition)}
          >
            {ACTION_LABEL[transition.to_status]}
          </Button>
        ))}
      </Space>
      {selected && (
        <StatusChangeModal task={task} transition={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

function idleHint(status: TaskStatus, isManager: boolean): string {
  if (status === 'accepted') return 'Задача принята — работа по ней завершена.'
  if (isManager) return 'Задача у исполнителя. Принять или вернуть её можно, когда она придёт на проверку.'
  if (status === 'review') return 'Задача на проверке у постановщика.'
  return 'Сейчас нет доступных вам действий.'
}

type ModalProps = {
  task: { id: string; status: TaskStatus }
  transition: Transition
  onClose: () => void
}

function StatusChangeModal({ task, transition, onClose }: ModalProps) {
  const [form] = Form.useForm<{ comment?: string }>()
  const change = useChangeTaskStatus()
  const { message } = App.useApp()

  const submit = async ({ comment }: { comment?: string }) => {
    try {
      await change.mutateAsync({ taskId: task.id, toStatus: transition.to_status, comment })
      message.success(`Статус изменён: «${STATUS_LABEL[transition.to_status]}»`)
      onClose()
    } catch (error) {
      message.error(errorMessage(error))
    }
  }

  return (
    <Modal
      open
      title={ACTION_LABEL[transition.to_status]}
      okText={ACTION_LABEL[transition.to_status]}
      okButtonProps={{ danger: transition.to_status === 'rework' }}
      cancelText="Отмена"
      confirmLoading={change.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
    >
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <StatusTag status={task.status} />
        <span>→</span>
        <StatusTag status={transition.to_status} />
      </Flex>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item
          name="comment"
          label={transition.comment_required ? 'Что нужно доработать' : 'Комментарий'}
          extra={transition.comment_required ? 'Обязательно для возврата на доработку' : 'Необязательно'}
          rules={
            transition.comment_required
              ? [{ required: true, whitespace: true, message: 'Напишите комментарий для исполнителя' }]
              : []
          }
        >
          <Input.TextArea rows={4} maxLength={2000} showCount autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  )
}
