import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Form, Input, Typography, theme } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext.ts'
import { errorMessage } from '../lib/errors.ts'
import { supabase } from '../lib/supabase.ts'

type Credentials = { email: string; password: string }

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const { token } = theme.useToken()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }

  const signIn = async ({ email, password }: Credentials) => {
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setSubmitting(false)
    if (signInError) setError(errorMessage(signInError))
  }

  return (
    <Flex
      align="center"
      justify="center"
      style={{ minHeight: '100vh', padding: 16, background: token.colorBgLayout }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Flex vertical gap={4} align="center" style={{ marginBottom: 24 }}>
          <img src="/favicon.svg" alt="" width={48} height={48} />
          <Typography.Title level={3} style={{ margin: 0 }}>
            Объекты и задачи
          </Typography.Title>
          <Typography.Text type="secondary">Вход для сотрудников</Typography.Text>
        </Flex>

        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

        <Form<Credentials> layout="vertical" requiredMark={false} onFinish={signIn}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Введите корректный email' }]}
          >
            <Input prefix={<MailOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            Войти
          </Button>
        </Form>

        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
          Регистрация закрыта: учётные записи выдаёт администратор.
        </Typography.Paragraph>
      </Card>
    </Flex>
  )
}
