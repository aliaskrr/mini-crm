import { Alert, Button } from 'antd'
import { errorMessage } from '../lib/errors.ts'

export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title="Не удалось загрузить данные"
      description={errorMessage(error)}
      action={onRetry && <Button onClick={onRetry}>Повторить</Button>}
      style={{ marginBottom: 16 }}
    />
  )
}
