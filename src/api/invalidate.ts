import { useQueryClient, type Query } from '@tanstack/react-query'
import { useCallback } from 'react'

/** Относится ли запрос к записи с этим id (карточка, её история, список задач объекта…). */
const mentions = (query: Query, id: string) => JSON.stringify(query.queryKey).includes(id)

/**
 * После любого изменения перезапрашиваем все списки и карточки — и открытые, и те, что в кэше
 * (refetchType 'all'): данных мало, а так при переходе на другой экран не мелькнут устаревшие
 * статус, счётчик или только что удалённая запись.
 *
 * except — id только что удалённой записи: её запросы помечаем устаревшими, но не перезапрашиваем,
 * иначе открытая карточка успела бы показать «не найдено» до перехода на список.
 */
export function useInvalidateAll() {
  const queryClient = useQueryClient()
  return useCallback(
    async (options?: { except?: string }) => {
      const except = options?.except
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== 'profile' && !(except && mentions(query, except)),
          refetchType: 'all',
        }),
        except
          ? queryClient.invalidateQueries({ predicate: (query) => mentions(query, except), refetchType: 'none' })
          : undefined,
      ])
    },
    [queryClient],
  )
}
