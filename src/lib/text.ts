/**
 * Пробельные и «невидимые» символы: обычные и неразрывные пробелы, переводы строк,
 * символы нулевой ширины, BOM и т. п. Тот же набор, что в базе (private.has_visible_text),
 * чтобы форма не пропускала то, что база отклонит. Коды перечислены числами —
 * так в исходнике нет невидимых символов.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0085, 0x0085], // next line
  [0x00a0, 0x00a0], // неразрывный пробел
  [0x115f, 0x1160], // корейские заполнители
  [0x1680, 0x1680],
  [0x180e, 0x180e],
  [0x2000, 0x200f], // типографские пробелы, zero-width space/joiner, метки направления
  [0x2028, 0x202f], // разделители строк/абзацев, управление направлением, узкий неразрывный пробел
  [0x205f, 0x2064], // математический пробел, word joiner, невидимые операторы
  [0x2800, 0x2800], // пустой символ Брайля
  [0x3000, 0x3000], // идеографический пробел
  [0x3164, 0x3164],
  [0xfeff, 0xfeff], // BOM
  [0xffa0, 0xffa0],
]

const escape = (codePoint: number) => `\\u${codePoint.toString(16).padStart(4, '0')}`

const INVISIBLE = new RegExp(
  `[\\s${INVISIBLE_RANGES.map(([from, to]) => (from === to ? escape(from) : `${escape(from)}-${escape(to)}`)).join('')}]`,
  'gu',
)

/** Есть ли в строке хотя бы один видимый символ. */
export function hasVisibleText(value: string | null | undefined): boolean {
  return Boolean(value && value.replace(INVISIBLE, '').length > 0)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Похоже ли значение на идентификатор записи (для параметров адреса страницы). */
export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value)
}
