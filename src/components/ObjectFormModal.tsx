import { App, Form, Input, Modal } from 'antd'
import { useSaveObject, type ObjectInput } from '../api/objects.ts'
import { errorMessage } from '../lib/errors.ts'

type Props = {
  /** Если передан — редактирование, иначе создание. */
  object?: { id: string } & ObjectInput
  onClose: () => void
  onSaved?: (id: string) => void
}

export function ObjectFormModal({ object, onClose, onSaved }: Props) {
  const [form] = Form.useForm<ObjectInput>()
  const save = useSaveObject()
  const { message } = App.useApp()

  const submit = async (values: ObjectInput) => {
    try {
      const saved = await save.mutateAsync({
        id: object?.id,
        values: { name: values.name.trim(), address: values.address.trim() },
      })
      message.success(object ? 'Объект сохранён' : 'Объект создан')
      onSaved?.(saved.id)
      onClose()
    } catch (error) {
      message.error(errorMessage(error))
    }
  }

  return (
    <Modal
      open
      title={object ? 'Изменить объект' : 'Новый объект'}
      okText={object ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={object ? { name: object.name, address: object.address } : undefined}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label="Название"
          rules={[{ required: true, whitespace: true, message: 'Укажите название' }]}
        >
          <Input maxLength={200} placeholder="ЖК «Северный парк», корпус 2" autoFocus />
        </Form.Item>
        <Form.Item
          name="address"
          label="Адрес"
          rules={[{ required: true, whitespace: true, message: 'Укажите адрес' }]}
        >
          <Input.TextArea rows={2} maxLength={500} placeholder="г. Москва, ул. Лесная, 12" />
        </Form.Item>
        <button type="submit" hidden />
      </Form>
    </Modal>
  )
}
