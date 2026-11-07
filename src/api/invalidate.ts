import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

/**
 * После любого изменения обновляем все списки и карточки: данных мало,
 * а так интерфейс гарантированно не покажет устаревший статус или счётчик.
 */
export function useInvalidateAll() {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'profile' }),
    [queryClient],
  )
}
