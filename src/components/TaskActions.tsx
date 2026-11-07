import { CheckOutlined, PlayCircleOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons'
import { App, Button, Flex, Form, Input, Modal, Space, Typography } from 'antd'
import { useRef, useState, type ReactNode } from 'react'
import { useChangeTaskStatus, type Transition } from '../api/tasks.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { errorMessage } from '../lib/errors.ts'
import { requiredText } from '../lib/formRules.ts'
import { ACTION_LABEL, STATUS_LABEL, type TaskStatus } from '../lib/labels.ts'
import { StatusTag } from './StatusTag.tsx'

const ACTION_ICON: Partial<Record<TaskStatus, ReactNode>> = {
  in_progress: <PlayCircleOutlined />,
  review: <SendOutlined />,
  accepted: <CheckOutlined />,
  rework: <RollbackOutlined />,
}

type Props = {
  /** transitions — действия, которые база разрешает текущему пользователю (get_available_transitions). */
  task: { id: string; status: TaskStatus; transitions: Transition[] }
}

/**
 * Кнопки смены статуса — ровно те, что разрешит база.
 * Компонент монтируется заново при каждой смене статуса (key в TaskPage),
 * поэтому открытый диалог не «переживёт» изменение статуса другим сотрудником.
 */
export function TaskActions({ task }: Props) {
  const { isManager } = useAuth()
  const [selected, setSelected] = useState<Transition | null>(null)

  if (task.transitions.length === 0) {
    return <Typography.Text type="secondary">{idleHint(task.status, isManager)}</Typography.Text>
  }

  return (
    <>
      <Space wrap>
        {task.transitions.map((transition) => (
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
  const inFlight = useRef(false)

  const submit = async ({ comment }: { comment?: string }) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await change.mutateAsync({ taskId: task.id, toStatus: transition.to_status, comment })
      message.success(`Статус изменён: «${STATUS_LABEL[transition.to_status]}»`)
      onClose()
    } catch (error) {
      // Диалог остаётся открытым (например, при сбое сети комментарий не потеряется).
      // Если статус тем временем сменил кто-то другой, карточка обновится и диалог закроется сам.
      message.error(errorMessage(error))
    } finally {
      inFlight.current = false
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
            transition.comment_required ? requiredText('Напишите комментарий для исполнителя') : []
          }
        >
          <Input.TextArea rows={4} maxLength={2000} showCount autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  )
}
