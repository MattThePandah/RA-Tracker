import React from 'react'

const FONT = {
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  '%': ['11001', '11010', '00100', '01000', '10110', '10011', '00000'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
}

const ROWS = 7
const COLS = 5

function buildMatrix(text, gapCols) {
  const rows = Array.from({ length: ROWS }, () => [])
  const chars = String(text || '').toUpperCase()
  const gap = Math.max(0, Number(gapCols) || 0)

  if (!chars) return rows

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i]
    const pattern = FONT[char] || FONT['?']
    for (let row = 0; row < ROWS; row += 1) {
      const line = pattern[row] || ''.padEnd(COLS, '0')
      for (let col = 0; col < COLS; col += 1) {
        rows[row].push(line[col] === '1')
      }
      for (let g = 0; g < gap; g += 1) {
        rows[row].push(false)
      }
    }
  }

  if (gap > 0) {
    for (let row = 0; row < ROWS; row += 1) {
      rows[row].splice(rows[row].length - gap, gap)
    }
  }

  return rows
}

export default function DotMatrixText({
  text,
  dotSize = 4,
  dotGap = 2,
  charGap = 1,
  className = '',
  scroll = false,
  maxColumns = null,
  maxChars = null,
  scrollSpeed = 18,
  scrollGap = 6
}) {
  const matrix = React.useMemo(() => buildMatrix(text, charGap), [text, charGap])
  const columns = matrix[0]?.length || 0
  const dots = matrix.flat()
  const columnWidth = dotSize + dotGap
  const resolvedMaxColumns = maxColumns ?? (maxChars ? (Math.max(1, maxChars) * (COLS + charGap) - charGap) : null)
  const shouldScroll = scroll && resolvedMaxColumns && columns > resolvedMaxColumns

  const baseVars = {
    '--dot-size': `${dotSize}px`,
    '--dot-gap': `${dotGap}px`
  }

  if (!shouldScroll) {
    return (
      <div
        className={`dot-matrix-text ${className}`.trim()}
        style={{ ...baseVars, gridTemplateColumns: `repeat(${columns}, var(--dot-size))` }}
        aria-label={text}
      >
        {dots.map((on, idx) => (
          <span key={idx} className={`dot-matrix-dot${on ? ' on' : ''}`} />
        ))}
      </div>
    )
  }

  const gapCols = Math.max(1, Number(scrollGap) || 0)
  const repeatMatrix = matrix
  const scrollRows = matrix.map((row, idx) => (
    row.concat(Array(gapCols).fill(false), repeatMatrix[idx] || [])
  ))
  const scrollDots = scrollRows.flat()
  const totalColumns = columns * 2 + gapCols
  const visibleColumns = Math.max(1, resolvedMaxColumns)
  const visibleWidth = visibleColumns * columnWidth - dotGap
  const scrollDistance = (columns + gapCols) * columnWidth
  const duration = Math.max(6, scrollDistance / Math.max(6, scrollSpeed))

  return (
    <div
      className={`dot-matrix-marquee ${className}`.trim()}
      style={{
        ...baseVars,
        width: `${visibleWidth}px`,
        '--marquee-distance': `${scrollDistance}px`,
        '--marquee-duration': `${duration}s`
      }}
      aria-label={text}
    >
      <div
        className="dot-matrix-text dot-matrix-track dot-matrix-track-scrolling"
        style={{ ...baseVars, gridTemplateColumns: `repeat(${totalColumns}, var(--dot-size))` }}
        aria-hidden="true"
      >
        {scrollDots.map((on, idx) => (
          <span key={idx} className={`dot-matrix-dot${on ? ' on' : ''}`} />
        ))}
      </div>
    </div>
  )
}
