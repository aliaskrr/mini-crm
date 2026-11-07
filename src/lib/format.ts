const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))
