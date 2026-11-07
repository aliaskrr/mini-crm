import { Button, Result } from 'antd'
import { Link } from 'react-router'

type Props = {
  title?: string
  subTitle?: string
}

export function NotFound({ title = 'Страница не найдена', subTitle }: Props) {
  return (
    <Result
      status="404"
      title={title}
      subTitle={subTitle}
      extra={
        <Link to="/">
          <Button type="primary">На главную</Button>
        </Link>
      }
    />
  )
}
