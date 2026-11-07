import { useMutation, useQuery } from '@tanstack/react-query'
import type { TaskStatus } from '../lib/labels.ts'
import { supabase } from '../lib/supabase.ts'
import { useInvalidateAll } from './invalidate.ts'

const TASK_LIST_COLUMNS =
  'id, title, status, created_at, object:objects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name)' as const

export function useTasks(filter: { objectId?: string; assigneeId?: string } = {}) {
  return useQuery({
    queryKey: ['tasks', 'list', filter],
    queryFn: async () => {
      let query = supabase.from('tasks').select(TASK_LIST_COLUMNS).order('created_at', { ascending: false })
      if (filter.objectId) query = query.eq('object_id', filter.objectId)
      if (filter.assigneeId) query = query.eq('assignee_id', filter.assigneeId)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export type TaskListItem = NonNullable<ReturnType<typeof useTasks>['data']>[number]

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', 'detail', taskId],
    enabled: Boolean(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `id, title, description, status, created_at, object_id, assignee_id,
           object:objects(id, name, address),
           assignee:profiles!tasks_assignee_id_fkey(id, full_name),
           author:profiles!tasks_author_id_fkey(id, full_name)`,
        )
        .eq('id', taskId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export type TaskDetails = NonNullable<ReturnType<typeof useTask>['data']>

export type HistoryEntry = {
  id: number
  from_status: TaskStatus | null
  to_status: TaskStatus
  comment: string | null
  created_at: string
  /** null, если профиль автора записи скрыт от текущего пользователя (прежний исполнитель). */
  actor: { id: string; full_name: string } | null
}

export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: ['task-history', taskId],
    queryFn: async (): Promise<HistoryEntry[]> => {
      const { data, error } = await supabase
        .from('task_status_history')
        .select(
          'id, from_status, to_status, comment, created_at, actor:profiles!task_status_history_changed_by_fkey(id, full_name)',
        )
        .eq('task_id', taskId)
        .order('id', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** Какие кнопки показать: решает база (get_available_transitions), а не интерфейс. */
export function useAvailableTransitions(taskId: string, currentStatus: TaskStatus) {
  return useQuery({
    queryKey: ['task-transitions', taskId, currentStatus],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_available_transitions', { p_task_id: taskId })
      if (error) throw error
      return data
    },
  })
}

export function useChangeTaskStatus() {
  const invalidateAll = useInvalidateAll()
  return useMutation({
    mutationFn: async (args: { taskId: string; toStatus: TaskStatus; comment?: string }) => {
      const { data, error } = await supabase.rpc('change_task_status', {
        p_task_id: args.taskId,
        p_to_status: args.toStatus,
        p_comment: args.comment?.trim() || undefined,
      })
      if (error) throw error
      return data
    },
    onSettled: invalidateAll,
  })
}

export type TaskInput = {
  title: string
  description: string
  object_id: string
  assignee_id: string
}

export function useSaveTask() {
  const invalidateAll = useInvalidateAll()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TaskInput }) => {
      // status, author_id, created_at не отправляем: их задаёт база, а прав на эти колонки у клиента нет.
      const { data, error } = id
        ? await supabase.from('tasks').update(values).eq('id', id).select('id').single()
        : await supabase.from('tasks').insert(values).select('id').single()
      if (error) throw error
      return data
    },
    onSuccess: invalidateAll,
  })
}

export function useDeleteTask() {
  const invalidateAll = useInvalidateAll()
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.rpc('delete_task', { p_task_id: taskId })
      if (error) throw error
    },
    onSuccess: invalidateAll,
  })
}
