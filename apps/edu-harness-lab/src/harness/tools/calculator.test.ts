import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CalcError, calculate, evaluateExpression, formatItMoney, formatItNumber, round2 } from './calculator'

describe('calculator', () => {
  it('respects operator precedence', () => {
    expect(evaluateExpression('2+3*4')).toBe(14)
    expect(evaluateExpression('10-4/2')).toBe(8)
    expect(evaluateExpression('2^3*2')).toBe(16)
  })
  it('handles parentheses', () => {
    expect(evaluateExpression('(2+3)*4')).toBe(20)
    expect(evaluateExpression('((1+1))*(2+(3))')).toBe(10)
  })
  it('handles unary minus and plus', () => {
    expect(evaluateExpression('-5+2')).toBe(-3)
    expect(evaluateExpression('--5')).toBe(5)
    expect(evaluateExpression('3*-2')).toBe(-6)
    expect(evaluateExpression('+4')).toBe(4)
  })
  it('accepts both comma and dot decimals', () => {
    expect(evaluateExpression('1,5*2')).toBe(3)
    expect(evaluateExpression('1.5*2')).toBe(3)
    expect(evaluateExpression('.5+,5')).toBe(1)
  })
  it('handles postfix percent', () => {
    expect(evaluateExpression('50%')).toBe(0.5)
    expect(evaluateExpression('200*10%')).toBe(20)
  })
  it('computes the guide total 4*1219*1.22 = 5948.72', () => {
    expect(calculate('4*1219*1.22').value).toBe(5948.72)
    expect(calculate('4*1219*1,22').text).toBe('5.948,72')
  })
  it('accepts currency symbols and multiplication/division signs', () => {
    expect(evaluateExpression('3 × 4 € ÷ 2')).toBe(6)
  })
  it('rejects division by zero with a math error', () => {
    try {
      evaluateExpression('1/0')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      expect((e as CalcError).kind).toBe('math')
    }
    expect(() => evaluateExpression('5/(2-2)')).toThrow(CalcError)
  })
  it('rejects non-arithmetic input', () => {
    for (const bad of ['abc', '2+a', 'sqrt(4)', 'alert(1)', 'Math.max(1,2)', 'process', '1; 2', '"x"', '']) {
      expect(() => evaluateExpression(bad), bad).toThrow(CalcError)
    }
  })
  it('rejects malformed syntax', () => {
    for (const bad of ['(1+2', '1+', '*3', '1 2', '1+2)']) {
      expect(() => evaluateExpression(bad), bad).toThrow(CalcError)
    }
  })
  it('rejects unrepresentable results', () => {
    expect(() => evaluateExpression('10^1000')).toThrow(CalcError)
  })
  it('formats numbers the Italian way', () => {
    expect(formatItNumber(5948.72)).toBe('5.948,72')
    expect(formatItNumber(1219)).toBe('1.219')
    expect(formatItMoney(1219)).toBe('1.219,00')
    expect(formatItNumber(-1234.5)).toBe('-1.234,50')
    expect(round2(-0.001)).toBe(0)
  })
  it('does not use eval or Function', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/harness/tools/calculator.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\beval\s*\(/)
    expect(code).not.toMatch(/new\s+Function|\bFunction\s*\(/)
  })
})
