import { LogoutOutlined } from '@ant-design/icons'
import { Button, Flex, Grid, Layout, Menu, Tag, Typography, theme } from 'antd'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuth, useCurrentProfile } from '../auth/AuthContext.ts'
import { ROLE_LABEL } from '../lib/labels.ts'

export function AppLayout() {
  const { isManager, signOut } = useAuth()
  const profile = useCurrentProfile()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const { token } = theme.useToken()

  const selectedKey = location.pathname.startsWith('/tasks') ? 'tasks' : 'objects'
  // На узком экране — короткие подписи, чтобы оба пункта меню помещались без «…».
  const compact = !screens.sm
  const menuItems = [
    {
      key: 'objects',
      label: <Link to="/objects">{isManager || compact ? 'Объекты' : 'Мои объекты'}</Link>,
    },
    {
      key: 'tasks',
      label: <Link to="/tasks">{compact ? 'Задачи' : isManager ? 'Все задачи' : 'Мои задачи'}</Link>,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 8 : 16,
          paddingInline: screens.md ? 24 : 12,
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <img src="/favicon.svg" alt="" width={28} height={28} />
          {screens.sm && (
            <Typography.Text strong style={{ fontSize: 16 }}>
              Объекты и задачи
            </Typography.Text>
          )}
        </Link>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
        />
        <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
          {screens.md && <Typography.Text>{profile.full_name}</Typography.Text>}
          {!compact && (
            <Tag color={isManager ? 'geekblue' : 'cyan'} style={{ marginInlineEnd: 0 }}>
              {ROLE_LABEL[profile.role]}
            </Tag>
          )}
          <Button icon={<LogoutOutlined />} onClick={() => void signOut()} title="Выйти">
            {screens.sm && 'Выйти'}
          </Button>
        </Flex>
      </Layout.Header>
      <Layout.Content
        style={{
          padding: screens.md ? 24 : 12,
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
