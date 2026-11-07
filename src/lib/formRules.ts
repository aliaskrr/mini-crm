import type { FormRule } from 'antd'
import { hasVisibleText } from './text.ts'

/** Обязательное текстовое поле: пустота, пробелы и невидимые символы не считаются заполнением. */
export function requiredText(message: string): FormRule[] {
  return [
    {
      required: true,
      validator: (_rule, value?: string) =>
        hasVisibleText(value) ? Promise.resolve() : Promise.reject(new Error(message)),
    },
  ]
}
