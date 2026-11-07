import { App, Form, Input, Modal, Select } from 'antd'
import { useRef } from 'react'
import { useObjects } from '../api/objects.ts'
import { useExecutors } from '../api/profiles.ts'
import { useSaveTask, type TaskInput } from '../api/tasks.ts'
import { errorMessage } from '../lib/errors.ts'
import { requiredText } from '../lib/formRules.ts'

type Props = {
  /** Если передана — редактирование, иначе создание. */
  task?: { id: string } & TaskInput
  /** Объект по умолчанию при создании из карточки объекта. */
  defaultObjectId?: string
  onClose: () => void
  onSaved?: (id: string) => void
}

export function TaskFormModal({ task, defaultObjectId, onClose, onSaved }: Props) {
  const [form] = Form.useForm<TaskInput>()
  const save = useSaveTask()
  const objects = useObjects()
  const executors = useExecutors()
  const { message } = App.useApp()
  // Повторное нажатие во время сохранения не должно создать вторую задачу.
  const inFlight = useRef(false)

  const submit = async (values: TaskInput) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const saved = await save.mutateAsync({
        id: task?.id,
        values: {
          title: values.title.trim(),
          description: (values.description ?? '').trim(),
          object_id: values.object_id,
          assignee_id: values.assignee_id,
        },
      })
      message.success(task ? 'Задача сохранена' : 'Задача создана')
      onSaved?.(saved.id)
      onClose()
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      inFlight.current = false
    }
  }

  return (
    <Modal
      open
      title={task ? 'Изменить задачу' : 'Новая задача'}
      okText={task ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          task
            ? {
                title: task.title,
                description: task.description,
                object_id: task.object_id,
                assignee_id: task.assignee_id,
              }
            : { object_id: defaultObjectId, description: '' }
        }
        onFinish={submit}
      >
        <Form.Item name="title" label="Название" rules={requiredText('Укажите название задачи')}>
          <Input maxLength={200} placeholder="Монтаж опалубки 3 этажа" autoFocus />
        </Form.Item>
        <Form.Item name="description" label="Описание">
          <Input.TextArea rows={4} maxLength={5000} showCount placeholder="Что сделать, требования, сроки" />
        </Form.Item>
        <Form.Item name="object_id" label="Объект" rules={[{ required: true, message: 'Выберите объект' }]}>
          <Select
            loading={objects.isPending}
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Выберите объект"
            options={objects.data?.map((object) => ({ value: object.id, label: object.name }))}
          />
        </Form.Item>
        <Form.Item
          name="assignee_id"
          label="Исполнитель"
          rules={[{ required: true, message: 'Выберите исполнителя' }]}
        >
          <Select
            loading={executors.isPending}
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Кому поручить"
            options={executors.data?.map((person) => ({ value: person.id, label: person.full_name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
